// lib/dante/eval/runner.ts
//
// Eval runner: executes a suite of test cases against a workflow or
// agent, records per-case results, and computes aggregate scores.
//
// Supports two grading modes:
//   1. Assertion-based — field-level checks against actual output
//      (exact match, contains, regex, numeric range, type check)
//   2. LLM-as-judge — uses a grading prompt to evaluate output quality
//      when ground truth is fuzzy (e.g. "is this a good lease summary?")
//
// Usage:
//   const result = await runEvalSuite({
//     suiteId: "...",
//     workspaceId: "...",
//     triggeredBy: userId,
//     model: "claude-sonnet-4-6",
//   });

import { supabaseAdmin } from "@/lib/supabase/admin";
import { complete as llmComplete } from "@/lib/llm/client";
import { llmContentText } from "@/lib/llm/types";
import * as n8nBridge from "@/lib/dante/n8n-bridge";
import { log as rootLog } from "@/lib/logging";

const evalLog = rootLog.child({ component: "eval-runner" });

// ── Types ────────────────────────────────────────────────────────

export interface Assertion {
  field: string;       // dot-path into actual output, e.g. "output.tenant_name"
  op: "eq" | "neq" | "contains" | "not_contains" | "regex" | "gt" | "gte" | "lt" | "lte" | "type" | "exists";
  value: unknown;
}

interface AssertionResult {
  assertion_idx: number;
  passed: boolean;
  actual_value: unknown;
  expected: unknown;
  op: string;
}

export interface EvalCase {
  id: string;
  name: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown> | null;
  assertions: Assertion[];
  weight: number;
}

export interface EvalCaseResult {
  case_id: string;
  actual: Record<string, unknown> | null;
  assertion_results: AssertionResult[];
  passed: boolean;
  score: number;
  llm_grade: string | null;
  llm_reasoning: string | null;
  duration_ms: number;
  tokens_in: number;
  tokens_out: number;
  error: string | null;
}

export interface RunEvalOptions {
  suiteId: string;
  workspaceId: string;
  triggeredBy?: string;
  model?: string;
  notes?: string;
  /** Use LLM grading for cases without assertions */
  llmGrade?: boolean;
}

export interface EvalRunResult {
  run_id: string;
  total_cases: number;
  passed: number;
  failed: number;
  score: number;
  duration_ms: number;
}

// ── Assertion evaluator ──────────────────────────────────────────

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function evaluateAssertion(
  actual: unknown,
  assertion: Assertion,
  idx: number,
): AssertionResult {
  const actualValue = getNestedValue(actual, assertion.field);
  let passed = false;

  switch (assertion.op) {
    case "eq":
      passed = JSON.stringify(actualValue) === JSON.stringify(assertion.value);
      break;
    case "neq":
      passed = JSON.stringify(actualValue) !== JSON.stringify(assertion.value);
      break;
    case "contains":
      passed =
        typeof actualValue === "string" &&
        typeof assertion.value === "string" &&
        actualValue.toLowerCase().includes(assertion.value.toLowerCase());
      break;
    case "not_contains":
      passed =
        typeof actualValue === "string" &&
        typeof assertion.value === "string" &&
        !actualValue.toLowerCase().includes(assertion.value.toLowerCase());
      break;
    case "regex":
      try {
        passed =
          typeof actualValue === "string" &&
          new RegExp(assertion.value as string).test(actualValue);
      } catch {
        passed = false;
      }
      break;
    case "gt":
      passed = typeof actualValue === "number" && actualValue > (assertion.value as number);
      break;
    case "gte":
      passed = typeof actualValue === "number" && actualValue >= (assertion.value as number);
      break;
    case "lt":
      passed = typeof actualValue === "number" && actualValue < (assertion.value as number);
      break;
    case "lte":
      passed = typeof actualValue === "number" && actualValue <= (assertion.value as number);
      break;
    case "type":
      passed = typeof actualValue === assertion.value;
      break;
    case "exists":
      passed = actualValue !== undefined && actualValue !== null;
      break;
  }

  return {
    assertion_idx: idx,
    passed,
    actual_value: actualValue,
    expected: assertion.value,
    op: assertion.op,
  };
}

// ── LLM-as-judge grading ─────────────────────────────────────────

async function llmGradeCase(
  caseDef: EvalCase,
  actual: unknown,
  workspaceId: string,
): Promise<{ grade: string; reasoning: string; tokens_in: number; tokens_out: number }> {
  const expectedStr = caseDef.expected
    ? `\n\nExpected output (ground truth):\n${JSON.stringify(caseDef.expected, null, 2)}`
    : "";

  const result = await llmComplete({
    model: "claude-haiku-4-5",
    messages: [
      {
        role: "system",
        content:
          "You are an eval grader for a CRE (commercial real estate) AI platform. " +
          "Grade the actual output against the test case. Respond with EXACTLY one line: " +
          '"pass", "partial", or "fail", followed by a pipe character and your reasoning. ' +
          'Example: "pass | The output correctly identified the tenant and lease terms."',
      },
      {
        role: "user",
        content:
          `Test case: ${caseDef.name}\n\n` +
          `Input:\n${JSON.stringify(caseDef.input, null, 2)}` +
          expectedStr +
          `\n\nActual output:\n${JSON.stringify(actual, null, 2)}`,
      },
    ],
    maxTokens: 200,
    temperature: 0,
    feature: "eval.llm_grade",
    workspaceId,
  });

  const text = llmContentText(result.message.content).trim();
  const pipeIdx = text.indexOf("|");
  const grade = pipeIdx > 0 ? text.slice(0, pipeIdx).trim().toLowerCase() : text.toLowerCase();
  const reasoning = pipeIdx > 0 ? text.slice(pipeIdx + 1).trim() : "";

  return {
    grade: ["pass", "partial", "fail"].includes(grade) ? grade : "fail",
    reasoning,
    tokens_in: result.usage.promptTokens,
    tokens_out: result.usage.completionTokens,
  };
}

// ── Workflow executor for eval ───────────────────────────────────

async function executeWorkflowCase(
  workflowId: string,
  workspaceId: string,
  input: Record<string, unknown>,
): Promise<{ output: unknown; tokens_in: number; tokens_out: number }> {
  const { data: wfRow } = await supabaseAdmin
    .from("dante_workflows")
    .select("*")
    .eq("id", workflowId)
    .maybeSingle();

  if (!wfRow) throw new Error(`Workflow ${workflowId} not found`);

  const n8nId = (wfRow as Record<string, unknown>).n8n_workflow_id as string | null;
  if (!n8nId) throw new Error(`Workflow ${workflowId} has no n8n engine ID`);

  // Execute via n8n and wait for result
  const executionId = await n8nBridge.executeWorkflowById(n8nId, input);
  // Give n8n a moment to finish, then fetch the result
  await new Promise((r) => setTimeout(r, 2000));
  const execution = await n8nBridge.getExecution(executionId, true);

  return {
    output: execution,
    tokens_in: 0,  // Token tracking handled by LLM client telemetry
    tokens_out: 0,
  };
}

// ── Main runner ──────────────────────────────────────────────────

export async function runEvalSuite(opts: RunEvalOptions): Promise<EvalRunResult> {
  const { suiteId, workspaceId, triggeredBy, model, notes, llmGrade = true } = opts;
  const startTime = Date.now();

  evalLog.info("starting eval run", { suiteId, workspaceId, model });

  // Load suite
  const { data: suite, error: suiteErr } = await supabaseAdmin
    .from("dante_eval_suites")
    .select("*")
    .eq("id", suiteId)
    .maybeSingle();

  if (suiteErr || !suite) {
    throw new Error(`Suite not found: ${suiteId}`);
  }

  // Load cases
  const { data: caseRows } = await supabaseAdmin
    .from("dante_eval_cases")
    .select("*")
    .eq("suite_id", suiteId)
    .order("created_at", { ascending: true });

  const cases: EvalCase[] = (caseRows || []).map((r: any) => ({
    id: r.id,
    name: r.name,
    input: r.input || {},
    expected: r.expected,
    assertions: (r.assertions || []) as Assertion[],
    weight: r.weight || 1.0,
  }));

  if (cases.length === 0) {
    throw new Error("Suite has no test cases");
  }

  // Create run record
  const { data: run } = await supabaseAdmin
    .from("dante_eval_runs")
    .insert({
      suite_id: suiteId,
      workspace_id: workspaceId,
      model: model || null,
      status: "running",
      total_cases: cases.length,
      triggered_by: triggeredBy || null,
      notes: notes || null,
    })
    .select("id")
    .single();

  if (!run) throw new Error("Failed to create eval run");
  const runId = run.id;

  // Execute each case
  const results: EvalCaseResult[] = [];
  let totalTokensIn = 0;
  let totalTokensOut = 0;

  for (const caseDef of cases) {
    const caseStart = Date.now();
    let result: EvalCaseResult;

    try {
      // Execute the case
      let actual: unknown = null;
      let tokIn = 0;
      let tokOut = 0;

      if (suite.eval_type === "workflow" && suite.workflow_id) {
        const wfResult = await executeWorkflowCase(
          suite.workflow_id,
          workspaceId,
          caseDef.input,
        );
        actual = wfResult.output;
        tokIn = wfResult.tokens_in;
        tokOut = wfResult.tokens_out;
      } else if (suite.eval_type === "prompt") {
        // Direct LLM call with the input as messages
        const promptResult = await llmComplete({
          model: model || "claude-sonnet-4-6",
          messages: caseDef.input.messages as any[] || [
            { role: "user", content: JSON.stringify(caseDef.input) },
          ],
          maxTokens: (caseDef.input.maxTokens as number) || 1000,
          feature: "eval.prompt",
          workspaceId,
        });
        actual = {
          text: llmContentText(promptResult.message.content),
          finish_reason: promptResult.finishReason,
        };
        tokIn = promptResult.usage.promptTokens;
        tokOut = promptResult.usage.completionTokens;
      } else {
        // Generic: just store the input as-is for manual review
        actual = caseDef.input;
      }

      // Evaluate assertions
      const assertionResults = caseDef.assertions.map((a, i) =>
        evaluateAssertion(actual, a, i),
      );
      const allAssertionsPassed =
        assertionResults.length === 0 || assertionResults.every((r) => r.passed);

      // LLM grading for cases without assertions (or with failed assertions)
      let grade: string | null = null;
      let reasoning: string | null = null;

      if (llmGrade && assertionResults.length === 0) {
        const gradeResult = await llmGradeCase(caseDef, actual, workspaceId);
        grade = gradeResult.grade;
        reasoning = gradeResult.reasoning;
        tokIn += gradeResult.tokens_in;
        tokOut += gradeResult.tokens_out;
      }

      const passed =
        assertionResults.length > 0
          ? allAssertionsPassed
          : grade === "pass" || grade === "partial";

      const score =
        assertionResults.length > 0
          ? assertionResults.filter((r) => r.passed).length / assertionResults.length
          : grade === "pass"
            ? 1.0
            : grade === "partial"
              ? 0.5
              : 0.0;

      result = {
        case_id: caseDef.id,
        actual: actual as Record<string, unknown>,
        assertion_results: assertionResults,
        passed,
        score,
        llm_grade: grade,
        llm_reasoning: reasoning,
        duration_ms: Date.now() - caseStart,
        tokens_in: tokIn,
        tokens_out: tokOut,
        error: null,
      };
    } catch (err) {
      result = {
        case_id: caseDef.id,
        actual: null,
        assertion_results: [],
        passed: false,
        score: 0,
        llm_grade: null,
        llm_reasoning: null,
        duration_ms: Date.now() - caseStart,
        tokens_in: 0,
        tokens_out: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    results.push(result);
    totalTokensIn += result.tokens_in;
    totalTokensOut += result.tokens_out;

    // Persist per-case result
    await supabaseAdmin.from("dante_eval_results").insert({
      run_id: runId,
      case_id: result.case_id,
      actual: result.actual,
      assertion_results: result.assertion_results,
      passed: result.passed,
      score: result.score,
      llm_grade: result.llm_grade,
      llm_reasoning: result.llm_reasoning,
      duration_ms: result.duration_ms,
      tokens_in: result.tokens_in,
      tokens_out: result.tokens_out,
      error: result.error,
    });
  }

  // Compute weighted score
  const totalWeight = cases.reduce((sum, c) => sum + c.weight, 0);
  const weightedScore = totalWeight > 0
    ? results.reduce((sum, r, i) => sum + r.score * cases[i].weight, 0) / totalWeight
    : 0;

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const durationMs = Date.now() - startTime;

  // Update run record
  await supabaseAdmin
    .from("dante_eval_runs")
    .update({
      status: "completed",
      passed,
      failed,
      score: Math.round(weightedScore * 1000) / 1000,
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
      total_tokens_in: totalTokensIn,
      total_tokens_out: totalTokensOut,
    })
    .eq("id", runId);

  evalLog.info("eval run complete", {
    runId,
    suiteId,
    total: cases.length,
    passed,
    failed,
    score: weightedScore,
    durationMs,
  });

  return {
    run_id: runId,
    total_cases: cases.length,
    passed,
    failed,
    score: weightedScore,
    duration_ms: durationMs,
  };
}

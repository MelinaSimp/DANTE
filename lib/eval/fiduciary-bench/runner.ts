// lib/eval/fiduciary-bench/runner.ts
//
// FiduciaryBench v1 runner. Executes a (task, instance) pair
// against the configured model via the LLM client, persists the
// run + auto-grade to the eval_runs / eval_grades tables, returns
// a structured RunResult.
//
// What this is NOT yet:
//   • A full agent-loop runner — v1 issues a single non-streaming
//     completion against the task's prompt template. Tasks that
//     should exercise the full agent loop (with tool use) will
//     need a v2 runner that drives the agent with the task as the
//     initial user message and harvests the trace + final
//     response. Foundation goes in here; the agent-loop variant
//     is a follow-up.
//   • A scheduler. Runs are triggered manually by the admin
//     /api/admin/eval/run endpoint or by CI calling runAllTasks.

import { complete as llmComplete } from "@/lib/llm/client";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { EvalTask, EvalTaskInstance, EvalAutoGrader } from "./types";
import { getTask } from "./index";

export interface RunResult {
  run_id: string;
  task_slug: string;
  instance_id: string;
  model: string;
  output: string;
  duration_ms: number;
  auto_grade: { answer_quality: number; source_reliability: number; notes: string } | null;
}

export interface RunOptions {
  /** Default: gpt-4o-mini — cheap default for sweeps. Override
   *  per-task / per-batch when running comparison evals. */
  model?: string;
  /** When the task has an auto_grader, run it after the model
   *  output lands. Default true. */
  auto_grade?: boolean;
  /** Optional triggering user — recorded on the run row for
   *  provenance. */
  triggered_user?: string | null;
  /** "manual" | "cron" | "ci". Default "manual". */
  triggered_by?: "manual" | "cron" | "ci";
}

const DEFAULT_MODEL = "gpt-4o-mini";

export async function runTaskInstance(
  task: EvalTask,
  instance: EvalTaskInstance,
  opts: RunOptions = {},
): Promise<RunResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const prompt = renderTemplate(task.prompt_template, instance.inputs);

  const t0 = Date.now();
  const llm = await llmComplete({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are responding to a FiduciaryBench evaluation prompt. Be precise. Cite primary regulatory sources by name (IRS Pub 590-B, FINRA Rule 3270, HUD Fair Housing Act, etc.) and section. Do NOT speculate when you don't know. If the question requires a numeric calculation, show your work.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.1,
    maxTokens: 1200,
  });
  const duration_ms = Date.now() - t0;

  const output = llm.message.content || "";
  let autoGrade: RunResult["auto_grade"] = null;
  if (opts.auto_grade !== false && task.auto_grader) {
    autoGrade = autoGradeOutput(task.auto_grader, output, instance);
  }

  // Persist.
  const { data: inserted, error } = await supabaseAdmin
    .from("eval_runs")
    .insert({
      task_slug: task.slug,
      task_version: task.version,
      model,
      inputs: instance.inputs,
      output,
      prompt_tokens: llm.usage.promptTokens,
      completion_tokens: llm.usage.completionTokens,
      total_tokens: llm.usage.totalTokens,
      duration_ms,
      auto_answer_quality: autoGrade?.answer_quality ?? null,
      auto_source_reliability: autoGrade?.source_reliability ?? null,
      auto_grade_notes: autoGrade?.notes ?? null,
      triggered_by: opts.triggered_by ?? "manual",
      triggered_user: opts.triggered_user ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`eval_runs insert failed: ${error.message}`);
  const runId = (inserted as { id: string }).id;

  if (autoGrade) {
    await supabaseAdmin.from("eval_grades").insert({
      run_id: runId,
      grader_kind: "auto",
      answer_quality: autoGrade.answer_quality,
      source_reliability: autoGrade.source_reliability,
      notes: autoGrade.notes,
    });
  }

  return {
    run_id: runId,
    task_slug: task.slug,
    instance_id: instance.id,
    model,
    output,
    duration_ms,
    auto_grade: autoGrade,
  };
}

export async function runAllTasks(opts: RunOptions = {}): Promise<RunResult[]> {
  const { TASKS } = await import("./index");
  const results: RunResult[] = [];
  for (const task of TASKS) {
    for (const instance of task.instances) {
      try {
        const r = await runTaskInstance(task, instance, opts);
        results.push(r);
      } catch (err) {
        // Don't break the sweep on one failure; record + continue.
        console.warn(
          `[fiduciary-bench] task=${task.slug} instance=${instance.id} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
  return results;
}

/**
 * Run by slug + instance id. Convenience entry point for the admin
 * /api/admin/eval/run route and for ad-hoc debugging.
 */
export async function runTaskBySlug(
  slug: string,
  instanceId: string,
  opts: RunOptions = {},
): Promise<RunResult> {
  const task = getTask(slug);
  if (!task) throw new Error(`Unknown task slug: ${slug}`);
  const instance = task.instances.find((i) => i.id === instanceId);
  if (!instance) {
    throw new Error(`Unknown instance id ${instanceId} for task ${slug}`);
  }
  return runTaskInstance(task, instance, opts);
}

// ── Helpers ─────────────────────────────────────────────────────

function renderTemplate(tpl: string, vars: Record<string, unknown>): string {
  // Tiny mustache-ish renderer — supports {{var}} and {{#if x}}…{{/if}}.
  // Sufficient for our task templates; full Handlebars would be
  // overkill.
  let out = tpl;
  // Conditionals first.
  out = out.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_m, name, body) => {
      const v = vars[name];
      return v != null && v !== "" ? body : "";
    },
  );
  // Variables.
  out = out.replace(/\{\{(\w+)\}\}/g, (_m, name) => {
    const v = vars[name];
    return v == null ? "" : String(v);
  });
  return out;
}

function autoGradeOutput(
  grader: EvalAutoGrader,
  output: string,
  instance: EvalTaskInstance,
): { answer_quality: number; source_reliability: number; notes: string } {
  if (grader.kind === "exact_amount_within_tolerance") {
    const tol = grader.tolerance ?? 0.5;
    const ref = pickPath(instance.reference, grader.path);
    if (typeof ref !== "number") {
      return {
        answer_quality: 0,
        source_reliability: 0,
        notes: `auto: reference at path ${grader.path.join(".")} is not a number`,
      };
    }
    // Pull the first $-prefixed amount from the output that's
    // within an order of magnitude of the reference.
    const match = output.match(/\$([\d,]+(?:\.\d+)?)/g);
    if (!match) {
      return {
        answer_quality: 0,
        source_reliability: 0,
        notes: `auto: no $ amount found in output`,
      };
    }
    const found = match
      .map((m) => Number(m.replace(/[$,]/g, "")))
      .filter((n) => Number.isFinite(n));
    const closest = found.reduce(
      (best, n) =>
        Math.abs(n - ref) < Math.abs(best - ref) ? n : best,
      found[0],
    );
    const within = Math.abs(closest - ref) <= tol;
    return {
      answer_quality: within ? 1 : Math.max(0, 1 - Math.abs(closest - ref) / Math.max(ref, 1)),
      source_reliability: 0.5, // auto can't judge sources; humans do
      notes: `auto: output amount $${closest.toFixed(2)} vs reference $${ref.toFixed(2)} (tol $${tol.toFixed(2)}). ${within ? "PASS" : "FAIL"}.`,
    };
  }
  if (grader.kind === "must_cite_authority") {
    const got = grader.required.filter((auth) =>
      output.toLowerCase().includes(auth.toLowerCase()),
    );
    const ratio = got.length / grader.required.length;
    return {
      answer_quality: ratio,
      source_reliability: ratio,
      notes: `auto: cited ${got.length}/${grader.required.length} required authorities (${got.join(", ") || "none"}).`,
    };
  }
  if (grader.kind === "must_match_structured") {
    // Best-effort string presence check for structured-output tasks.
    const got = grader.required_fields.filter((f) =>
      output.toLowerCase().includes(f.toLowerCase()),
    );
    const ratio = got.length / grader.required_fields.length;
    return {
      answer_quality: ratio,
      source_reliability: 0.5,
      notes: `auto: mentioned ${got.length}/${grader.required_fields.length} required fields.`,
    };
  }
  return {
    answer_quality: 0,
    source_reliability: 0,
    notes: `auto: unknown grader kind`,
  };
}

function pickPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur && typeof cur === "object" && k in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }
  return cur;
}

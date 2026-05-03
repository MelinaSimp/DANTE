// evals/runner.ts
//
// Lightweight eval runner. Walks evals/tasks/{advisor,realtor}/*.json,
// runs each through the agent stack, applies the assertions, prints a
// vertical-split summary.
//
// Phase 1 scaffold — no parallelism, no per-model comparison. Future
// phases (W3.5 parity sprint) extend this to a full harness.
//
// Run:
//   npx tsx evals/runner.ts
//   npx tsx evals/runner.ts --vertical=advisor
//   npx tsx evals/runner.ts --task=001-summarize-client-call

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Assertion, EvalResult, EvalSummary, EvalTask, Vertical } from "./types";

const TASKS_ROOT = join(__dirname, "tasks");
const VERTICALS: Vertical[] = ["advisor", "realtor"];
const PARITY_FLAG_THRESHOLD = 10; // points — Δ ≥ 10% triggers a CI flag

function parseArgs(): { vertical?: Vertical; task?: string } {
  const out: { vertical?: Vertical; task?: string } = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--(\w+)=(.+)$/);
    if (!m) continue;
    if (m[1] === "vertical" && (m[2] === "advisor" || m[2] === "realtor")) {
      out.vertical = m[2];
    } else if (m[1] === "task") {
      out.task = m[2];
    }
  }
  return out;
}

function loadTasks(filter: { vertical?: Vertical; task?: string }): EvalTask[] {
  const tasks: EvalTask[] = [];
  for (const v of VERTICALS) {
    if (filter.vertical && filter.vertical !== v) continue;
    const dir = join(TASKS_ROOT, v);
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith(".json")) continue;
      const path = join(dir, name);
      if (!statSync(path).isFile()) continue;
      const raw = readFileSync(path, "utf8");
      const task = JSON.parse(raw) as EvalTask;
      if (filter.task && task.id !== filter.task) continue;
      tasks.push(task);
    }
  }
  return tasks;
}

// ── Assertion checks ─────────────────────────────────────────────

const CITATION_RE = /\[(v\d+|mem:[0-9a-f]{4,32})\]/g;

function countCitations(text: string): number {
  return Array.from(text.matchAll(CITATION_RE)).length;
}

function applyAssertion(
  a: Assertion,
  ctx: {
    responseText: string;
    toolsCalled: string[];
    citationCount: number;
    citationReportOverall?: string;
  },
): string | null {
  const t = ctx.responseText.toLowerCase();
  switch (a.type) {
    case "must_contain":
      return t.includes(a.value.toLowerCase()) ? null : `must_contain "${a.value}"`;
    case "must_not_contain":
      return t.includes(a.value.toLowerCase()) ? `must_not_contain "${a.value}"` : null;
    case "must_cite":
      return ctx.citationCount > 0 ? null : "must_cite — no citation markers found";
    case "min_citation_count":
      return ctx.citationCount >= a.value
        ? null
        : `min_citation_count ${a.value} (found ${ctx.citationCount})`;
    case "must_call_tool":
      return ctx.toolsCalled.includes(a.tool) ? null : `must_call_tool "${a.tool}"`;
    case "must_not_call_tool":
      return ctx.toolsCalled.includes(a.tool) ? `must_not_call_tool "${a.tool}"` : null;
    case "must_admit_gap": {
      const gapPhrases = [
        "i don't have",
        "i don't see",
        "not in",
        "no record",
        "couldn't find",
        "cannot find",
        "no information",
      ];
      return gapPhrases.some((p) => t.includes(p))
        ? null
        : "must_admit_gap — response did not acknowledge missing info";
    }
    case "citations_must_validate":
      if (!ctx.citationReportOverall) return null; // skipped if no validator run
      return ctx.citationReportOverall === "valid" ||
        ctx.citationReportOverall === "no_citations"
        ? null
        : `citations_must_validate (got "${ctx.citationReportOverall}")`;
  }
}

// ── Synthetic agent stub ─────────────────────────────────────────
//
// Phase 1 scaffold doesn't run the real agent — it would require a
// live Supabase + OpenAI plus seeded data per task. Instead the
// runner shells out to a `mockAgentRun` that the task author can
// override per fixture, OR (for live runs in CI) a `liveAgentRun`
// that hits the actual /api/dante/ask endpoint with a test workspace.
//
// We default to a deterministic mock that returns the task's
// `input` echoed plus a configurable canned response. Real agent
// integration is wired in W3.5 when the eval surface expands.

interface AgentRunResult {
  responseText: string;
  toolsCalled: string[];
  citationReportOverall?: string;
}

async function mockAgentRun(task: EvalTask): Promise<AgentRunResult> {
  // Deterministic stub. Tasks that need real-agent behavior
  // override this by setting MOCK_RESPONSE in the JSON (see the
  // shipped tasks for an example).
  const mock = (task as { mockResponse?: string }).mockResponse;
  return {
    responseText: mock ?? `[mock] ${task.input}`,
    toolsCalled: [],
  };
}

// ── Main loop ────────────────────────────────────────────────────

async function run(): Promise<EvalSummary> {
  const args = parseArgs();
  const tasks = loadTasks(args);
  const results: EvalResult[] = [];

  console.log(`Running ${tasks.length} task${tasks.length === 1 ? "" : "s"}...\n`);

  for (const task of tasks) {
    const start = Date.now();
    const run = await mockAgentRun(task);
    const citationCount = countCitations(run.responseText);
    const failures: string[] = [];
    for (const a of task.expectations) {
      const fail = applyAssertion(a, {
        responseText: run.responseText,
        toolsCalled: run.toolsCalled,
        citationCount,
        citationReportOverall: run.citationReportOverall,
      });
      if (fail) failures.push(fail);
    }
    const result: EvalResult = {
      task,
      pass: failures.length === 0,
      failures,
      responseText: run.responseText,
      toolsCalled: run.toolsCalled,
      citationCount,
      durationMs: Date.now() - start,
    };
    results.push(result);
    const mark = result.pass ? "✓" : "✗";
    console.log(`  ${mark} [${task.vertical}] ${task.id} — ${task.description}`);
    if (!result.pass) {
      for (const f of result.failures) {
        console.log(`      └─ ${f}`);
      }
    }
  }

  const summary = summarize(results);
  printSummary(summary);
  return summary;
}

function summarize(results: EvalResult[]): EvalSummary {
  const byVertical: EvalSummary["byVertical"] = {
    advisor: { total: 0, passed: 0, failed: 0 },
    realtor: { total: 0, passed: 0, failed: 0 },
  };
  for (const r of results) {
    const v = byVertical[r.task.vertical];
    v.total++;
    if (r.pass) v.passed++;
    else v.failed++;
  }
  const advRate = byVertical.advisor.total
    ? (byVertical.advisor.passed / byVertical.advisor.total) * 100
    : 0;
  const reRate = byVertical.realtor.total
    ? (byVertical.realtor.passed / byVertical.realtor.total) * 100
    : 0;
  return {
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
    byVertical,
    parityDelta: Math.abs(advRate - reRate),
    results,
  };
}

function printSummary(s: EvalSummary): void {
  console.log("\n" + "─".repeat(60));
  for (const v of VERTICALS) {
    const b = s.byVertical[v];
    if (b.total === 0) continue;
    const pct = ((b.passed / b.total) * 100).toFixed(0);
    console.log(`  ${v.toUpperCase()}: ${b.passed}/${b.total} passed (${pct}%)`);
  }
  console.log(`  TOTAL:   ${s.passed}/${s.total} passed`);
  if (s.parityDelta >= PARITY_FLAG_THRESHOLD) {
    console.log(
      `  ⚠  PARITY FLAG — Δ ${s.parityDelta.toFixed(0)}% between advisor and realtor (threshold ${PARITY_FLAG_THRESHOLD}%)`,
    );
  }
  console.log("─".repeat(60));
}

run()
  .then((s) => {
    process.exit(s.failed === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error("eval runner failed:", err);
    process.exit(2);
  });

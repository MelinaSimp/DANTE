// evals/types.ts
//
// Shape of an eval task. Designed to be small and composable so a
// non-engineer can add a regression test by editing a JSON file.

export type Vertical = "advisor" | "realtor";

export type Assertion =
  /** Response text must contain this substring (case-insensitive). */
  | { type: "must_contain"; value: string }
  /** Response text must NOT contain this substring (case-insensitive). */
  | { type: "must_not_contain"; value: string }
  /** Response must include at least one citation marker [v\d] or [mem:...]. */
  | { type: "must_cite" }
  /** At least N citation markers must appear. */
  | { type: "min_citation_count"; value: number }
  /** A specific tool must have been called during the agent loop. */
  | { type: "must_call_tool"; tool: string }
  /** A specific tool must NOT have been called. */
  | { type: "must_not_call_tool"; tool: string }
  /** Response must explicitly admit a gap (variation of "I don't know" / "not in vault"). */
  | { type: "must_admit_gap" }
  /** Citation validator must return overall=valid (no quote/page mismatches). */
  | { type: "citations_must_validate" };

export interface EvalTask {
  id: string;
  vertical: Vertical;
  description: string;
  /** What to send to the agent. The runner wraps this in a synthetic
   *  workspace context with the fixtures listed below. */
  input: string;
  /** Names of fixture files (under evals/fixtures/) to load before
   *  running. Each fixture is a setup helper that seeds memory/vault
   *  rows the task expects to retrieve. */
  fixtures?: string[];
  expectations: Assertion[];
}

export interface EvalResult {
  task: EvalTask;
  pass: boolean;
  failures: string[];   // human-readable assertion failures
  responseText: string;
  toolsCalled: string[];
  citationCount: number;
  durationMs: number;
}

export interface EvalSummary {
  total: number;
  passed: number;
  failed: number;
  byVertical: Record<Vertical, { total: number; passed: number; failed: number }>;
  parityDelta: number;  // |advisor pass% - realtor pass%|, in points
  results: EvalResult[];
}

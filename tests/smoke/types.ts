// tests/smoke/types.ts
//
// Shared types for the smoke runner. Each path exports an object
// shaped like SmokePath; the runner discovers them, runs them in
// sequence (not parallel — we want clean failure attribution), and
// reports per-path pass/fail.

export interface SmokeContext {
  /** Base URL the smoke suite hits, e.g. https://driftai.studio. */
  baseUrl: string;
  /** Cookie header for an authenticated test user. CI secret. */
  authCookie: string;
}

export interface SmokeResult {
  pass: boolean;
  /** Free-form note the runner prints on failure (and on pass for diagnostics). */
  detail?: string;
  /** Latency in ms — useful when triaging slow paths. */
  durationMs: number;
}

export interface SmokePath {
  name: string;
  /** Run the path. Throw or return {pass:false} to fail. */
  run: (ctx: SmokeContext) => Promise<SmokeResult>;
}

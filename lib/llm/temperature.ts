// lib/llm/temperature.ts
//
// Locked, documented temperature policy. Providers only send a
// temperature when one is explicitly passed; calls that omit it (the
// agent loop did) otherwise run at the model's default of ~1.0 —
// non-deterministic, exactly what you don't want in a regulated CRE
// tool. complete() in client.ts fills an undefined temperature from
// this table by `feature`, so behavior is deterministic and auditable
// without editing every call site. An explicit per-call temperature
// always wins (intentional override).

/** Fallback when a feature has no explicit policy entry. Conservative
 *  on purpose — well below the model default — so an untagged call
 *  never silently runs hot. */
export const DEFAULT_TEMPERATURE = 0.3;

/**
 * Per-feature locked temperatures. Three tiers:
 *   0.0       deterministic: extraction, grading, enforcement, rollups
 *   0.2-0.3   grounded generation: the agent loop, briefs, summaries
 *   0.4       exploratory: workflow synthesis, where some diversity helps
 */
export const FEATURE_TEMPERATURE: Record<string, number> = {
  // Deterministic
  "eval.prompt": 0,
  "eval.llm_grade": 0,
  "memory.consolidate": 0,
  "memory.rollup": 0,
  "health": 0,
  "agent.loop.void_enforcement": 0,
  "lease.abstract": 0,

  // Grounded generation — kept tight to minimize hallucination
  "agent.loop": 0.2,
  "agent.loop.retry": 0.2,
  "agent.loop.truncated": 0.2,
  "briefs.generate": 0.2,
  "noticer_agent": 0.2,
  "vision.analyze": 0.2,
  "web_scrape": 0.2,
  "deep_research": 0.2,
  "ask.followups": 0.3,
  "refine.rewrite": 0.3,

  // Exploratory
  "workflow.generate": 0.4,
  "workflow.generate.n8n": 0.4,
  "workflow.propose": 0.4,
};

/**
 * Resolve the locked temperature for a feature. Returns the policy
 * value if the feature is known, else the conservative default.
 */
export function resolveTemperature(feature?: string): number {
  if (feature && Object.prototype.hasOwnProperty.call(FEATURE_TEMPERATURE, feature)) {
    return FEATURE_TEMPERATURE[feature];
  }
  return DEFAULT_TEMPERATURE;
}

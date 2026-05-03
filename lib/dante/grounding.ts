// lib/dante/grounding.ts
//
// Per-response grounding score. Phase 3+ panel finding (Priya):
// "the agent doesn't surface 'this answer is grounded vs inferred
// vs general knowledge.' That's the next-level trust UX."
//
// Computed from the trace + the response text:
//
//   citation_density   — how many cite markers per ~100 words.
//                        High density = the model is grounding
//                        most claims, not a few.
//   tool_grounding     — fraction of tools-called that are
//                        retrieval (memory.search / archive.search /
//                        vault.cite) vs. mutating or null. A response
//                        that only retrieved is grounded; a response
//                        that didn't retrieve at all is general.
//   validator_pass     — fraction of citations that passed the
//                        validator. Bad citations don't count as
//                        grounding.
//
// Combined into a single 0..1 score. Surfaced in the SSE stream and
// persisted on dante_chat_messages.grounding_score so audit /
// telemetry can answer "what % of advisor answers were strongly
// grounded last week?"

import type { CitationValidationReport } from "./citation-validator";

const RETRIEVAL_TOOLS = new Set([
  "memory.search",
  "memory_search",
  "archive.search",
  "archive_search",
  "vault.cite",
  "vault_cite",
  "clients.query",
  "clients_query",
  "skill.run",
  "skill_run",
]);

const CITATION_RE = /\[(?:v\d+|mem:[0-9a-f]{4,32})\]/g;

interface TraceEntry {
  step_id?: string;
  step_name?: string;
  status?: string;
  output?: unknown;
}

export type GroundingTier = "strong" | "partial" | "general" | "none";

export interface GroundingScore {
  /** 0..1 composite. */
  score: number;
  /** Human-readable bucket for UI display. */
  tier: GroundingTier;
  /** Friendly summary line, e.g. "Grounded in 3 vault citations + 2 memory hits." */
  summary: string;
  /** Component breakdown — useful for telemetry / debugging. */
  parts: {
    citation_count: number;
    word_count: number;
    citation_density: number;
    retrieval_tools_called: number;
    total_tools_called: number;
    tool_grounding: number;
    validator_pass_rate: number;
  };
}

export interface ComputeGroundingInput {
  responseText: string;
  trace: TraceEntry[];
  citationReport?: CitationValidationReport | null;
}

export function computeGroundingScore(
  input: ComputeGroundingInput,
): GroundingScore {
  const text = input.responseText || "";
  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
  const citationCount = (text.match(CITATION_RE) || []).length;

  // Density per 100 words, normalized to 0..1 with diminishing
  // returns. Three citations per 100 words ≈ saturation; more
  // doesn't keep raising the score.
  const rawDensity = wordCount > 0 ? (citationCount * 100) / wordCount : 0;
  const citation_density = Math.min(1, rawDensity / 3);

  // Tool grounding: of the tool calls in the trace, how many were
  // retrieval-shaped? A response that called memory.search + vault.cite
  // is grounded by definition; one that called nothing is at best
  // general knowledge.
  let retrieval_tools_called = 0;
  let total_tools_called = 0;
  for (const entry of input.trace) {
    const name = entry.step_name || "";
    // Step names are like "agent → memory_search" — trim the prefix.
    const tool = name.includes("→") ? name.split("→")[1]?.trim() : name;
    if (!tool) continue;
    total_tools_called += 1;
    if (RETRIEVAL_TOOLS.has(tool)) retrieval_tools_called += 1;
  }
  const tool_grounding = total_tools_called > 0 ? retrieval_tools_called / total_tools_called : 0;

  // Validator pass rate. If the validator didn't run (no citations
  // emitted, or the validator was unavailable), treat as 1 — we
  // don't punish responses that legitimately don't need citations
  // (e.g. "summarize what I just said").
  let validator_pass_rate = 1;
  if (input.citationReport && input.citationReport.counts.total > 0) {
    validator_pass_rate =
      input.citationReport.counts.valid / input.citationReport.counts.total;
  }

  // Composite. Weights:
  //   citation_density       — 0.4   (claims ARE cited)
  //   tool_grounding         — 0.3   (the model actually retrieved)
  //   validator_pass_rate    — 0.3   (the citations were real)
  //
  // No-tool-call responses with no citations score 0 — they're
  // general knowledge, which is the right verdict.
  const composite =
    citation_density * 0.4 + tool_grounding * 0.3 + validator_pass_rate * 0.3;
  // But if the response made zero retrieval attempts AND has zero
  // citations, ignore validator_pass_rate's free 0.3. Otherwise an
  // unsourced answer would always score >= 0.3, which is wrong.
  const score =
    retrieval_tools_called === 0 && citationCount === 0
      ? 0
      : Math.min(1, composite);

  // Tier mapping — chosen by where the breakpoints feel right in
  // testing. "strong" requires both citations and validation;
  // "partial" tolerates one weakness; "general" is the no-tool path.
  let tier: GroundingTier;
  if (score >= 0.7) tier = "strong";
  else if (score >= 0.4) tier = "partial";
  else if (retrieval_tools_called > 0 || citationCount > 0) tier = "partial";
  else if (total_tools_called > 0) tier = "general";
  else tier = "none";

  // Friendly summary. We keep this short — it renders below the
  // response in the chip-summary slot.
  const vaultCount = input.citationReport
    ? input.citationReport.checks.filter((c) => c.type === "vault" && c.status === "valid").length
    : 0;
  const memoryCount = input.citationReport
    ? input.citationReport.checks.filter((c) => c.type === "memory" && c.status === "valid").length
    : 0;

  let summary: string;
  if (tier === "strong") {
    summary = `Strongly grounded — ${vaultCount} vault citation${vaultCount === 1 ? "" : "s"}${memoryCount > 0 ? ` + ${memoryCount} memory hit${memoryCount === 1 ? "" : "s"}` : ""}.`;
  } else if (tier === "partial") {
    summary = "Partially grounded — some claims uncited or unverified.";
  } else if (tier === "general") {
    summary = "General knowledge — no retrieval performed.";
  } else {
    summary = "Ungrounded.";
  }

  return {
    score: Math.round(score * 100) / 100,
    tier,
    summary,
    parts: {
      citation_count: citationCount,
      word_count: wordCount,
      citation_density: Math.round(citation_density * 100) / 100,
      retrieval_tools_called,
      total_tools_called,
      tool_grounding: Math.round(tool_grounding * 100) / 100,
      validator_pass_rate: Math.round(validator_pass_rate * 100) / 100,
    },
  };
}

// lib/dante/regulatory/agentic-search.ts
//
// Iterative retrieval over the regulatory corpus. Wraps
// searchRegulatoryCorpus with a loop that:
//
//   1. Issues an initial vector search.
//   2. Inspects the results — coverage by authority, top-result
//      similarity, presence of "near-miss" hits.
//   3. If coverage is thin, asks a small LLM to propose ONE refined
//      query that targets the gap.
//   4. Re-runs search. Repeat up to MAX_ROUNDS or until a stop
//      condition fires.
//   5. De-dupes hits across rounds, returns the merged top-K.
//
// Why: per the panel's reading of Harvey's 2026 architecture, their
// "agentic search" loop is 3-10 iterative retrieval rounds per
// complex query. Patrick (ex-Harvey) called it out as Drift's
// cheapest free-recall improvement — works on stock embeddings,
// compounds with custom embeddings later. This is that pattern.
//
// Cost discipline:
//   • MAX_ROUNDS bounds the query budget.
//   • Stop early when (a) we have enough high-similarity hits, (b)
//     a refinement round adds nothing new, (c) similarity ceiling
//     stops moving.
//   • Per-round LLM call uses gpt-4o-mini (refinement is shallow;
//     no need for a frontier model).
//
// Future: when a custom finance-embedding model lands (panel
// recommendation #8), this loop is unchanged — it sits above the
// retriever and benefits from any retriever upgrade for free.

import { complete as llmComplete } from "@/lib/llm/client";
import {
  searchRegulatoryCorpus,
  type RegulatoryHit,
  type RegulatorySearchInput,
} from "./search";

const REFINER_MODEL = "gpt-4o-mini";
const DEFAULT_MAX_ROUNDS = 4;
const HIGH_SIM_FLOOR = 0.55;        // hits at/above this count toward "we have enough"
const ENOUGH_HIGH_SIM_HITS = 4;
const STAGNANT_DELTA = 0.01;        // top-1 sim must move at least this much round-over-round
const TOP_K_PER_ROUND = 8;

export interface AgenticSearchInput {
  query: string;
  industry?: "financial_advisor" | "real_estate" | null;
  /** Final top-K to return. Default 5; the loop fetches more per
   *  round and merges. */
  k?: number;
  /** Default 4. Up to ~10; beyond that, diminishing returns. */
  maxRounds?: number;
  /** Logs each round's queries + counts so the agent's trace can
   *  surface what the search did under the hood. */
  trace?: boolean;
}

export interface AgenticSearchRound {
  round: number;
  query: string;
  new_hit_count: number;
  total_hit_count: number;
  top_similarity: number | null;
  refined_from?: string;   // present on rounds > 1
}

export interface AgenticSearchResult {
  /** Merged top-K hits across all rounds, deduplicated by chunk_id. */
  hits: RegulatoryHit[];
  /** Per-round audit trail. */
  rounds: AgenticSearchRound[];
  /** Why the loop stopped — surfaced in the prompt for transparency. */
  stop_reason:
    | "max_rounds"
    | "enough_high_similarity_hits"
    | "stagnant_similarity"
    | "no_new_hits"
    | "refinement_failed";
}

export async function agenticSearchRegulatoryCorpus(
  input: AgenticSearchInput,
): Promise<AgenticSearchResult> {
  const maxRounds = Math.min(input.maxRounds ?? DEFAULT_MAX_ROUNDS, 10);
  const finalK = Math.min(Math.max(input.k ?? 5, 1), 25);

  const seenChunks = new Set<string>();
  const merged: RegulatoryHit[] = [];
  const rounds: AgenticSearchRound[] = [];
  let lastTopSim: number | null = null;
  let stopReason: AgenticSearchResult["stop_reason"] = "max_rounds";

  let currentQuery = input.query;
  let priorQuery: string | undefined = undefined;

  for (let r = 1; r <= maxRounds; r += 1) {
    const searchInput: RegulatorySearchInput = {
      query: currentQuery,
      industry: input.industry ?? null,
      k: TOP_K_PER_ROUND,
    };
    let hits: RegulatoryHit[] = [];
    try {
      hits = await searchRegulatoryCorpus(searchInput);
    } catch {
      hits = [];
    }

    const newHits = hits.filter((h) => !seenChunks.has(h.chunk_id));
    for (const h of newHits) {
      seenChunks.add(h.chunk_id);
      merged.push(h);
    }
    const topSim = hits.length > 0 ? hits[0].similarity : null;
    rounds.push({
      round: r,
      query: currentQuery,
      new_hit_count: newHits.length,
      total_hit_count: merged.length,
      top_similarity: topSim,
      refined_from: r === 1 ? undefined : priorQuery,
    });

    // Stop conditions, in priority order.

    // (a) we already have enough high-similarity hits to answer
    const highSimCount = merged.filter(
      (h) => h.similarity >= HIGH_SIM_FLOOR,
    ).length;
    if (highSimCount >= ENOUGH_HIGH_SIM_HITS) {
      stopReason = "enough_high_similarity_hits";
      break;
    }

    // (b) similarity stopped moving — further refinement won't help
    if (
      r > 1 &&
      lastTopSim !== null &&
      topSim !== null &&
      Math.abs(topSim - lastTopSim) < STAGNANT_DELTA
    ) {
      stopReason = "stagnant_similarity";
      break;
    }

    // (c) refinement round added zero new hits
    if (r > 1 && newHits.length === 0) {
      stopReason = "no_new_hits";
      break;
    }

    lastTopSim = topSim;

    if (r === maxRounds) {
      stopReason = "max_rounds";
      break;
    }

    // Refine for next round.
    priorQuery = currentQuery;
    const refined = await refineQuery({
      originalQuery: input.query,
      lastQuery: currentQuery,
      hitsSoFar: merged,
      industry: input.industry ?? null,
    });
    if (!refined || refined.trim().toLowerCase() === currentQuery.trim().toLowerCase()) {
      // Refiner couldn't propose a meaningfully different query.
      stopReason = "refinement_failed";
      break;
    }
    currentQuery = refined;
  }

  // Sort merged hits by similarity desc and trim to finalK.
  merged.sort((a, b) => b.similarity - a.similarity);
  return {
    hits: merged.slice(0, finalK),
    rounds,
    stop_reason: stopReason,
  };
}

interface RefineInput {
  originalQuery: string;
  lastQuery: string;
  hitsSoFar: RegulatoryHit[];
  industry: "financial_advisor" | "real_estate" | null;
}

/**
 * Asks a small model to propose ONE refined query that targets a
 * gap in the current results. Designed to be cheap (gpt-4o-mini,
 * ~50 tokens out) and conservative — if the model can't produce a
 * meaningful refinement it returns the empty string and the loop
 * stops.
 */
async function refineQuery(input: RefineInput): Promise<string | null> {
  // Compact context: top-3 hits' titles + authorities so the model
  // sees what we already have. No content — keeps the prompt small.
  const haveBlock = input.hitsSoFar
    .slice(0, 3)
    .map((h) => `- [${h.authority}] ${h.title}`)
    .join("\n");

  const audience =
    input.industry === "real_estate"
      ? "real estate brokerage compliance"
      : "fiduciary investment-advisor compliance";

  const sys =
    "You write a SINGLE refined search query for a vector store of regulatory documents. Your job is to find what the user is asking about that the current results MISSED. Output exactly one line — the new query, no preamble, no quotes, no explanation. If you can't think of a meaningfully different angle, output the empty string.";
  const user = `Domain: ${audience}.

Original user query: "${input.originalQuery}"
Last search query that was used: "${input.lastQuery}"

Top-3 results we already have:
${haveBlock || "(none)"}

Propose one refined query that pulls in regulatory documents we likely missed — different terminology, related rule, adjacent authority, the implementing regulation if the user asked about a statute (or vice versa), etc. One line.`;

  try {
    const result = await llmComplete({
      model: REFINER_MODEL,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      maxTokens: 80,
    });
    const txt = (result.message.content || "").trim();
    if (!txt) return null;
    // Strip surrounding quotes if the model added them.
    return txt.replace(/^["']|["']$/g, "").trim() || null;
  } catch {
    return null;
  }
}

/**
 * Format an agentic search result for the prompt — same [reg:N]
 * convention as the single-shot formatter, with an extra line
 * disclosing the search rounds for transparency. The agent gets to
 * see what the retrieval system did and can mention it in its
 * answer if useful.
 */
export function formatAgenticHitsForPrompt(
  result: AgenticSearchResult,
): string {
  const header =
    `(retrieval ran ${result.rounds.length} round${
      result.rounds.length === 1 ? "" : "s"
    } — stopped: ${result.stop_reason.replace(/_/g, " ")})`;
  if (result.hits.length === 0) {
    return `(no relevant regulatory sources found across ${result.rounds.length} rounds)`;
  }
  const body = result.hits
    .map((h, i) => {
      const date = h.published_at
        ? new Date(h.published_at).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "n.d.";
      return `[reg:${i + 1}] (${h.authority} · ${h.source_kind} · ${date}) ${h.title}\nSource: ${h.source_url}\n\n${h.content.trim()}`;
    })
    .join("\n\n---\n\n");
  return `${header}\n\n${body}`;
}

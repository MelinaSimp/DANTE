// lib/dante/memory/search.ts
//
// Hybrid retrieval over dante_memory. Mirrors the contract of
// lib/dante/archive/search.ts deliberately so the agent loop can
// route to either store with the same shape.
//
// Vector path: when a natural-language query is provided, we embed
// it and call the dante_memory_search RPC, which combines cosine
// similarity with confidence weighting.
//
// Structured path: when callers only want "everything we know
// about contact X" (no semantic ranking), they can pass an empty
// query — the RPC falls back to recency × confidence ordering.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { embedOne, toPgVector } from "@/lib/dante/archive/embed";
import type { MemoryHit, MemoryKind } from "./types";

export interface MemorySearchInput {
  workspaceId: string;
  /**
   * Natural-language query. Embedded for vector ranking. Pass an
   * empty string to skip embedding (the RPC zero-vectors and falls
   * back to recency × confidence).
   */
  query: string;
  /** Narrow to one subject. Most agent-loop calls pass this. */
  contactId?: string;
  /** Restrict to specific kinds. Default: all three. */
  kinds?: MemoryKind[];
  /** Top-K cap. RPC clamps to [1, 25]. */
  k?: number;
  /**
   * Phase 3+ panel fix #5 — boost rows whose metadata.category
   * matches. Detected from the query when callers don't pass it
   * explicitly (queries like "what are the Marlows' dealbreakers"
   * resolve to category="dealbreaker"). Boost is +0.15 on
   * similarity — small enough that semantic ranking still wins on
   * a clearly-better non-category hit, large enough to break ties
   * in favor of the right taxonomy.
   */
  category?: string;
}

// Lightweight intent detection for the optional category boost.
// Catches the obvious cases — explicit category words in the query.
// Sophisticated intent extraction is a Phase 4 LLM-classifier job.
const CATEGORY_KEYWORDS: Record<string, string> = {
  dealbreaker: "dealbreaker",
  "deal breaker": "dealbreaker",
  preference: "preference",
  preferences: "preference",
  timeline: "timeline",
  financing: "financing_status",
  "pre-approval": "financing_status",
  preapproval: "financing_status",
  objection: "objection_handled",
  "tour feedback": "tour_feedback",
  showing: "tour_feedback",
  neighborhood: "neighborhood_interest",
  // Advisor side
  risk: "risk_profile",
  "risk profile": "risk_profile",
  "life event": "life_event",
  goal: "goal_change",
  goals: "goal_change",
  compliance: "compliance_note",
  family: "family_context",
  tax: "tax_situation",
  estate: "estate_plan",
};

function inferCategory(query: string): string | undefined {
  const q = query.toLowerCase();
  for (const [kw, cat] of Object.entries(CATEGORY_KEYWORDS)) {
    if (q.includes(kw)) return cat;
  }
  return undefined;
}

const ZERO_VECTOR_1536 = `[${new Array(1536).fill(0).join(",")}]`;

export async function searchMemory(input: MemorySearchInput): Promise<MemoryHit[]> {
  const k = Math.min(Math.max(Number(input.k) || 8, 1), 25);

  // Empty query → skip the embedding round-trip and pass a zero
  // vector. The RPC's CASE expression treats null embeddings as
  // similarity=0 either way, so the structured ordering (recency ×
  // confidence) still works.
  const queryVec = input.query.trim().length > 0
    ? toPgVector(await embedOne(input.query))
    : ZERO_VECTOR_1536;

  // Optional category boost — explicit > inferred > none.
  const category = input.category ?? inferCategory(input.query);

  const { data, error } = await supabaseAdmin.rpc("dante_memory_search", {
    p_workspace_id: input.workspaceId,
    p_query_embedding: queryVec,
    p_contact_id: input.contactId ?? null,
    p_kinds: input.kinds && input.kinds.length > 0 ? input.kinds : null,
    p_limit: k,
    p_category: category ?? null,
  });

  if (error) {
    // Migration not applied yet → degrade silently so callers don't
    // have to special-case the rollout window.
    const code = (error as { code?: string }).code;
    if (code === "42883" || code === "42P01") return [];
    throw new Error(`Memory search: ${error.message}`);
  }

  return (data || []) as MemoryHit[];
}

/**
 * Format memory hits for an LLM prompt. Each hit is tagged with a
 * citation marker `[mem:<id-prefix>]` so the model can ground its
 * answer and the runner can resolve clicks back to the source row.
 *
 * Mirrors formatHitsForPrompt() in archive/search.ts so the agent
 * loop can stitch archive + memory citations into the same prompt.
 */
export function formatMemoryHitsForPrompt(hits: MemoryHit[]): string {
  if (hits.length === 0) return "(no relevant memories found)";
  return hits
    .map((h, i) => {
      const tag = `[mem:${h.id.slice(0, 8)} · ${h.kind}]`;
      return `[${i + 1}] ${tag}\n${h.content.trim()}`;
    })
    .join("\n\n---\n\n");
}

// lib/dante/regulatory/search.ts
//
// Retrieval over the workspace-shared regulatory corpus
// (regulatory_corpus_items / regulatory_corpus_chunks). Mirrors
// lib/dante/archive/search.ts in shape but queries a different
// table and is industry-scoped instead of workspace-scoped.
//
// The agent calls this via the new `regulatory.search` tool. The
// citation infrastructure already handles "[N] source · authority"
// shaped markers, so the formatHitsForPrompt output here is meant
// to plug in alongside vault hits without special-casing.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { embedOne, toPgVector } from "@/lib/dante/archive/embed";

export interface RegulatorySearchInput {
  query: string;
  industry?: "real_estate" | null;
  /** Top-k chunks (default 5, max 25). */
  k?: number;
  /** Drop hits below this cosine similarity. Default 0 → no floor. */
  minSimilarity?: number;
}

export interface RegulatoryHit {
  item_id: string;
  chunk_id: string;
  authority: string;
  source_kind: string;
  source_url: string;
  title: string;
  ord: number;
  content: string;
  similarity: number;
  published_at: string | null;
}

export async function searchRegulatoryCorpus(
  input: RegulatorySearchInput,
): Promise<RegulatoryHit[]> {
  const k = Math.min(Math.max(Number(input.k) || 5, 1), 25);
  const vec = await embedOne(input.query);

  const { data, error } = await supabaseAdmin.rpc("regulatory_corpus_search", {
    p_query_embedding: toPgVector(vec),
    p_industry: input.industry ?? null,
    p_limit: k,
    p_min_similarity: input.minSimilarity ?? 0,
  });

  if (error) {
    // 42883 / 42P01 = function or table missing → migration not run
    // yet; return empty so the agent degrades instead of throwing.
    const code = (error as { code?: string }).code;
    if (code === "42883" || code === "42P01") return [];
    throw new Error(`Regulatory corpus search: ${error.message}`);
  }
  return (data || []) as RegulatoryHit[];
}

/**
 * Format regulatory hits for the agent's prompt. Each hit gets a
 * citation marker the model can drop inline, plus the authority
 * (SEC / IRS / DOL / HUD) so the model knows what kind of source
 * it's citing — this matters because the model's response should
 * frame "the SEC has held" differently from "an IRS Private Letter
 * Ruling notes" differently from "HUD enforcement found".
 */
export function formatRegulatoryHitsForPrompt(hits: RegulatoryHit[]): string {
  if (hits.length === 0) return "(no relevant regulatory sources found)";
  return hits
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
}

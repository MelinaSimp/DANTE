// lib/dante/archive/search.ts
//
// Retrieval helper — callable from both the /api/dante/archive/search
// route (for the UI search bar) and the workflow runner (for the
// archive_lookup step). Keeping it in one place so the ranking
// behavior stays consistent no matter who's asking.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { embedOne, toPgVector } from "./embed";
import type { ArchiveSearchHit } from "./types";

export interface SearchInput {
  workspaceId: string;
  query: string;
  k?: number;            // how many chunks to return (default 5, max 20)
  kindFilter?: string;   // restrict to one ArchiveKind
  projectId?: string;    // restrict to one vault project
}

export async function searchArchive(input: SearchInput): Promise<ArchiveSearchHit[]> {
  const k = Math.min(Math.max(Number(input.k) || 5, 1), 20);
  const vec = await embedOne(input.query);

  const { data, error } = await supabaseAdmin.rpc("dante_archive_search", {
    p_workspace_id: input.workspaceId,
    p_query_embedding: toPgVector(vec),
    p_limit: k,
    p_kind_filter: input.kindFilter || null,
    p_project_id: input.projectId || null,
  });

  if (error) {
    // 42P01 = undefined_table → migration hasn't run yet; return empty
    // so the caller degrades instead of blowing up.
    if ((error as { code?: string }).code === "42883" || (error as { code?: string }).code === "42P01") {
      return [];
    }
    throw new Error(`Archive search: ${error.message}`);
  }
  return (data || []) as ArchiveSearchHit[];
}

/**
 * Format hits for an LLM prompt. Each chunk gets a citation marker
 * like `[Form ADV · p.7]` so the model can ground its answer and
 * callers can surface the references in the UI afterward.
 */
export function formatHitsForPrompt(hits: ArchiveSearchHit[]): string {
  if (hits.length === 0) return "(no relevant archive documents found)";
  return hits
    .map((h, i) => {
      const page = h.page_number != null ? `p.${h.page_number}` : "";
      const cite = [h.document_title, page].filter(Boolean).join(" · ");
      return `[${i + 1}] (${cite})\n${h.content.trim()}`;
    })
    .join("\n\n---\n\n");
}

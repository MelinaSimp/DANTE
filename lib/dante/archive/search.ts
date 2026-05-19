// lib/dante/archive/search.ts
//
// Retrieval helper — callable from both the /api/dante/archive/search
// route (for the UI search bar) and the workflow runner (for the
// archive_lookup step). Keeping it in one place so the ranking
// behavior stays consistent no matter who's asking.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { embedOne, toPgVector } from "./embed";
import { ingestVaultItem } from "@/lib/vault/ingest";
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

  const [embeddingHits, titleHits] = await Promise.all([
    embeddingSearch(input.workspaceId, input.query, k, input.kindFilter, input.projectId),
    titleFallbackSearch(input.workspaceId, input.query, k, input.projectId),
  ]);

  if (embeddingHits.length === 0) return titleHits.slice(0, k);
  if (titleHits.length === 0) return embeddingHits;

  const seenDocIds = new Set(embeddingHits.map((h) => h.document_id));
  const newFromTitle = titleHits.filter((h) => !seenDocIds.has(h.document_id));
  return [...embeddingHits, ...newFromTitle].slice(0, k);
}

async function embeddingSearch(
  workspaceId: string,
  query: string,
  k: number,
  kindFilter?: string,
  projectId?: string,
): Promise<ArchiveSearchHit[]> {
  const vec = await embedOne(query);

  const { data, error } = await supabaseAdmin.rpc("dante_archive_search", {
    p_workspace_id: workspaceId,
    p_query_embedding: toPgVector(vec),
    p_limit: k,
    p_kind_filter: kindFilter || null,
    p_project_id: projectId || null,
  });

  if (error) {
    if ((error as { code?: string }).code === "42883" || (error as { code?: string }).code === "42P01") {
      return [];
    }
    throw new Error(`Archive search: ${error.message}`);
  }

  return (data || []) as ArchiveSearchHit[];
}

const STOP_WORDS = new Set([
  "the", "for", "and", "that", "this", "with", "from", "have",
  "what", "how", "can", "you", "about", "into", "know", "explain",
  "tell", "give", "show", "find", "get", "going", "need", "want",
  "does", "did", "has", "was", "are", "been", "will", "would",
]);

async function titleFallbackSearch(
  workspaceId: string,
  query: string,
  limit: number,
  projectId?: string,
): Promise<ArchiveSearchHit[]> {
  // Extract distinctive keywords — drop stop words and short terms
  const keywords = query
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()))
    .map((w) => w.toLowerCase())
    .slice(0, 8);
  if (keywords.length === 0) return [];

  // Build OR filter — match documents whose title contains ANY keyword.
  // Uses Supabase `.or()` with individual ilike conditions.
  const orClauses = keywords.map((kw) => `title.ilike.%${kw}%`).join(",");

  let q = supabaseAdmin
    .from("vault_items")
    .select("id, title, kind, content, project_id")
    .eq("workspace_id", workspaceId)
    .or(orClauses)
    .limit(limit);

  if (projectId) {
    q = q.eq("project_id", projectId);
  }

  const { data: items, error } = await q;
  if (error || !items || items.length === 0) return [];

  // Convert vault_items rows into ArchiveSearchHit format.
  // If the item has chunks, return those; otherwise return a
  // synthetic hit from the item content/title.
  const results: ArchiveSearchHit[] = [];

  for (const item of items) {
    let { data: chunks } = await supabaseAdmin
      .from("vault_item_chunks")
      .select("id, chunk_index, page_number, content")
      .eq("item_id", item.id)
      .order("chunk_index")
      .limit(3);

    if ((!chunks || chunks.length === 0) && item.id) {
      try {
        console.log(`[archive-search] auto-ingest starting for "${item.title}" (${item.id})`);
        const result = await ingestVaultItem(item.id, { force: true });
        console.log(`[archive-search] auto-ingest result for ${item.id}: chunks=${result.chunkCount}, skipped=${result.skipped ?? "no"}`);
        if (result.chunkCount > 0) {
          const { data: freshChunks } = await supabaseAdmin
            .from("vault_item_chunks")
            .select("id, chunk_index, page_number, content")
            .eq("item_id", item.id)
            .order("chunk_index")
            .limit(3);
          if (freshChunks && freshChunks.length > 0) chunks = freshChunks;
        }
      } catch (err) {
        console.error(`[archive-search] auto-ingest FAILED for "${item.title}" (${item.id}):`, err instanceof Error ? err.message : err);
      }
    }

    if (chunks && chunks.length > 0) {
      for (const c of chunks) {
        results.push({
          chunk_id: c.id,
          document_id: item.id,
          chunk_index: c.chunk_index,
          page_number: c.page_number,
          content: c.content,
          similarity: 0.5,
          document_title: item.title,
          document_kind: item.kind,
          project_id: item.project_id,
        });
      }
    } else if (item.content) {
      results.push({
        chunk_id: item.id,
        document_id: item.id,
        chunk_index: 0,
        page_number: null,
        content: item.content.slice(0, 2000),
        similarity: 0.4,
        document_title: item.title,
        document_kind: item.kind,
        project_id: item.project_id,
      });
    } else {
      results.push({
        chunk_id: item.id,
        document_id: item.id,
        chunk_index: 0,
        page_number: null,
        content: `[Document "${item.title}" exists in the vault. The system attempted to extract its content but was unable to read the file. This is a system-level issue, not something the user did wrong. Report this to the user and offer to try again.]`,
        similarity: 0.3,
        document_title: item.title,
        document_kind: item.kind,
        project_id: item.project_id,
      });
    }
  }

  return results.slice(0, limit);
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

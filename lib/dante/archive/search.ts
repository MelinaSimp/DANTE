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

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms); }),
  ]).finally(() => clearTimeout(timer!));
}

export async function searchArchive(input: SearchInput): Promise<ArchiveSearchHit[]> {
  const k = Math.min(Math.max(Number(input.k) || 5, 1), 20);

  const [embeddingHits, titleHits, fileIndexHits] = await Promise.all([
    withTimeout(embeddingSearch(input.workspaceId, input.query, k, input.kindFilter, input.projectId), 8000, []),
    withTimeout(titleFallbackSearch(input.workspaceId, input.query, k, input.projectId), 6000, []),
    withTimeout(fileIndexFallbackSearch(input.workspaceId, input.query, k), 4000, []),
  ]);

  const seenDocIds = new Set<string>();
  const merged: ArchiveSearchHit[] = [];

  for (const h of embeddingHits) {
    if (!seenDocIds.has(h.document_id)) {
      seenDocIds.add(h.document_id);
      merged.push(h);
    }
  }
  for (const h of titleHits) {
    if (!seenDocIds.has(h.document_id)) {
      seenDocIds.add(h.document_id);
      merged.push(h);
    }
  }
  for (const h of fileIndexHits) {
    if (!seenDocIds.has(h.document_id)) {
      seenDocIds.add(h.document_id);
      merged.push(h);
    }
  }

  return merged.slice(0, k);
}

async function embeddingSearch(
  workspaceId: string,
  query: string,
  k: number,
  kindFilter?: string,
  projectId?: string,
): Promise<ArchiveSearchHit[]> {
  let vec: number[];
  try {
    vec = await embedOne(query);
  } catch (err) {
    console.error("[archive-search] embedding failed, falling back to title search:", err instanceof Error ? err.message : err);
    return [];
  }

  const { data, error } = await supabaseAdmin.rpc("dante_archive_search", {
    p_workspace_id: workspaceId,
    p_query_embedding: toPgVector(vec),
    p_limit: k,
    p_kind_filter: kindFilter || null,
    p_project_id: projectId || null,
  });

  if (error) {
    console.error("[archive-search] RPC error:", (error as { code?: string }).code, error.message);
    if ((error as { code?: string }).code === "42883" || (error as { code?: string }).code === "42P01") {
      return [];
    }
    return [];
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

  const fetchLimit = Math.max(limit * 4, 20);
  let q = supabaseAdmin
    .from("vault_items")
    .select("id, title, kind, content, project_id")
    .eq("workspace_id", workspaceId)
    .or(orClauses)
    .limit(fetchLimit);

  if (projectId) {
    q = q.eq("project_id", projectId);
  }

  const { data: items, error } = await q;
  if (error || !items || items.length === 0) return [];

  const results: ArchiveSearchHit[] = [];

  const itemIds = items.map((it) => it.id);
  const { data: allChunks } = await supabaseAdmin
    .from("vault_item_chunks")
    .select("id, item_id, chunk_index, page_number, content")
    .in("item_id", itemIds)
    .order("chunk_index")
    .limit(fetchLimit * 3);

  const chunksByItem = new Map<string, typeof allChunks>();
  for (const c of allChunks || []) {
    const arr = chunksByItem.get(c.item_id) || [];
    if (arr.length < 3) arr.push(c);
    chunksByItem.set(c.item_id, arr);
  }

  const chunkedItems = items.filter((it) => chunksByItem.has(it.id));
  const contentItems = items.filter((it) => !chunksByItem.has(it.id) && it.content);
  const emptyItems = items.filter((it) => !chunksByItem.has(it.id) && !it.content);

  for (const item of chunkedItems) {
    for (const c of chunksByItem.get(item.id)!) {
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
  }
  for (const item of contentItems) {
    results.push({
      chunk_id: item.id,
      document_id: item.id,
      chunk_index: 0,
      page_number: null,
      content: item.content!.slice(0, 2000),
      similarity: 0.4,
      document_title: item.title,
      document_kind: item.kind,
      project_id: item.project_id,
    });
  }
  for (const item of emptyItems.slice(0, 3)) {
    results.push({
      chunk_id: item.id,
      document_id: item.id,
      chunk_index: 0,
      page_number: null,
      content: `[Document "${item.title}" found in vault but not yet indexed.]`,
      similarity: 0.2,
      document_title: item.title,
      document_kind: item.kind,
      project_id: item.project_id,
    });
  }

  if (emptyItems.length > 0) {
    Promise.allSettled(
      emptyItems.slice(0, 3).map((it) =>
        ingestVaultItem(it.id, { force: true }).catch(() => {})
      )
    );
  }

  return results.slice(0, limit);
}

async function fileIndexFallbackSearch(
  workspaceId: string,
  query: string,
  limit: number,
): Promise<ArchiveSearchHit[]> {
  const keywords = query
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()))
    .map((w) => w.toLowerCase())
    .slice(0, 8);
  if (keywords.length === 0) return [];

  const orClauses = keywords.map((kw) => `file_name.ilike.%${kw}%`).join(",");

  const { data: files, error } = await supabaseAdmin
    .from("watched_file_index")
    .select("id, file_name, file_path, vault_item_id, ingest_status")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .or(orClauses)
    .limit(limit);

  if (error || !files || files.length === 0) return [];

  return files
    .filter((f) => !f.vault_item_id || f.ingest_status !== "ingested")
    .map((f) => ({
      chunk_id: f.id,
      document_id: f.id,
      chunk_index: 0,
      page_number: null,
      content: `[File "${f.file_name}" found on the user's file system at: ${f.file_path}. ` +
        `This file has not been ingested into the vault yet. ` +
        `Call file_index.ingest with index_entry_id="${f.id}" to retrieve and index its content, ` +
        `then use vault.cite to search the extracted text.]`,
      similarity: 0.35,
      document_title: f.file_name,
      document_kind: "other",
      project_id: null as string | null,
    }));
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

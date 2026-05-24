// lib/dante/auto-mode.ts
//
// Query-level processing-mode detection. The static resolver in
// lib/llm/processing-mode.ts walks workspace → contact → doc →
// chat (most-restrictive wins) and is right when the local_only
// flag is set on something the agent already has in scope. But
// when the user asks Dante about a file by name —
// "what does the LOI say about exclusivity?" — the static
// resolver doesn't know which doc the question is about, so a
// cloud-default workspace stays cloud, and a local_only file
// in the vault gets answered against an empty hit set.
//
// This helper closes that gap. Before the agent loop runs, we:
//   1. Embed the user's question.
//   2. Search vault_item_chunks for the top K hits (same RPC the
//      vault.cite tool calls).
//   3. Look up the hit documents' processing_mode_override.
//   4. If any of the top hits is flagged local_only, force the
//      whole turn to local_only — Dante's reply will be composed
//      by Hermes, not OpenAI, and the chunks will be surfaced
//      from a query that's safe to run against local content.
//
// The auto-detection composes with the static resolver via
// "most-restrictive wins" — a workspace already in local_only
// stays local_only, a workspace in cloud can still be flipped
// to local_only by an auto-detected hit. Cloud-only is never
// forced; only local_only.
//
// One pre-flight embed + one RPC call adds ~200-400ms to the
// first turn of each chat. We accept that to keep the user from
// having to think about which model they want.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { embedOne, toPgVector } from "@/lib/dante/archive/embed";

export interface AutoModeResult {
  mode: "cloud" | "local_only";
  reason:
    | "no_query"
    | "no_hits"
    | "all_hits_cloud"
    | "top_hit_local_only"
    | "embed_failed"
    | "search_failed";
  /** Title of the local-only doc that triggered the routing, when
   *  reason='top_hit_local_only'. Useful for logging + UI hints. */
  triggering_doc_title?: string;
}

const TOP_K_FOR_DETECTION = 3;

/**
 * Detect whether the user's most recent question is about a
 * local_only vault item, and if so force local_only mode.
 * Cloud-default if the question doesn't hit any local-flagged
 * docs (or if the lookup fails — fail-safe to cloud).
 */
export async function detectAutoLocalMode(input: {
  workspaceId: string;
  query: string;
}): Promise<AutoModeResult> {
  const query = (input.query || "").trim();
  if (query.length < 3) {
    return { mode: "cloud", reason: "no_query" };
  }

  let vec: number[];
  try {
    vec = await embedOne(query);
  } catch {
    return { mode: "cloud", reason: "embed_failed" };
  }

  // Top-K hit search via the same RPC vault.cite uses.
  const { data: hits, error } = await supabaseAdmin.rpc(
    "dante_archive_search",
    {
      p_workspace_id: input.workspaceId,
      p_query_embedding: toPgVector(vec),
      p_limit: TOP_K_FOR_DETECTION,
      p_kind_filter: null,
    },
  );
  if (error) {
    return { mode: "cloud", reason: "search_failed" };
  }
  const rows = (hits || []) as Array<{
    document_id: string;
    document_title?: string;
    similarity?: number;
  }>;
  if (rows.length === 0) {
    return { mode: "cloud", reason: "no_hits" };
  }

  // Look up the hit documents' processing_mode_override. If any
  // top hit is flagged local_only, we route the whole turn local.
  const docIds = Array.from(new Set(rows.map((r) => r.document_id)));
  const { data: items } = await supabaseAdmin
    .from("vault_items")
    .select("id, title, processing_mode_override")
    .in("id", docIds);
  const byId = new Map(
    (items || []).map((i) => [
      (i as { id: string }).id,
      i as { processing_mode_override: string | null; title: string },
    ]),
  );

  for (const r of rows) {
    const item = byId.get(r.document_id);
    if (item?.processing_mode_override === "local_only") {
      return {
        mode: "local_only",
        reason: "top_hit_local_only",
        triggering_doc_title: item.title || r.document_title,
      };
    }
  }
  return { mode: "cloud", reason: "all_hits_cloud" };
}

// Vault ingestion pipeline.
//
// Takes a vault_items row, ensures `content` is populated (downloads
// + extracts from file_url if needed), splits into ~500-word chunks
// with overlap, embeds each chunk via OpenAI, and inserts into
// vault_item_chunks. After this runs, dante_archive_search can find
// the document and Dante's archive.search / vault.cite tools will
// return real hits with citations.
//
// Idempotent: clears any existing chunks for the item before inserting,
// so calling this twice on the same item is safe.

import { supabaseAdmin, adminClient } from "@/lib/supabase/admin";
import { embedTexts, toPgVector } from "@/lib/dante/archive/embed";
import { extractText, extractTextWithPages } from "@/lib/vault/extract";
import { type ChunkWithProvenance, chunkTextWithPages } from "@/lib/vault/chunking";

export interface IngestResult {
  itemId: string;
  chunkCount: number;
  skipped?: "no-content" | "already-ingested";
}

interface VaultItemRow {
  id: string;
  workspace_id: string;
  title: string;
  content: string | null;
  text_extracted: boolean | null;
  file_url: string | null;
  file_type: string | null;
}

export async function ingestVaultItem(
  itemId: string,
  opts: { force?: boolean } = {},
): Promise<IngestResult> {
  const { data: item, error } = await supabaseAdmin
    .from("vault_items")
    .select("id, workspace_id, title, content, text_extracted, file_url, file_type")
    .eq("id", itemId)
    .maybeSingle<VaultItemRow>();

  if (error) throw new Error(`Vault load: ${error.message}`);
  if (!item) throw new Error(`vault_items ${itemId} not found`);

  if (item.text_extracted && !opts.force) {
    return { itemId, chunkCount: 0, skipped: "already-ingested" };
  }

  // If the row has no inline content but does have an uploaded file,
  // download + extract text on the fly. This is the path that fires
  // for PDFs / docs uploaded through the Vault UI — the upload route
  // only stores the binary, so without this step we'd have nothing
  // to chunk.
  let text = (item.content || "").trim();
  let pageChunks: ChunkWithProvenance[] | null = null;

  if (!text && item.file_url) {
    try {
      const extracted = await downloadAndExtractWithPages(item.file_url, item.file_type);
      if (extracted.fullText) {
        await supabaseAdmin
          .from("vault_items")
          .update({ content: extracted.fullText })
          .eq("id", itemId);
        text = extracted.fullText.trim();
        // Use page-aware chunks if we got per-page data
        if (extracted.pages && extracted.pages.length > 0) {
          pageChunks = chunkTextWithPages(extracted.pages);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "extract failed";
      await supabaseAdmin
        .from("vault_items")
        .update({
          text_extracted: false,
          chunk_count: 0,
          ingest_error: `extract from file_url: ${msg}`,
        })
        .eq("id", itemId);
      throw new Error(`Extract: ${msg}`);
    }
  }

  if (!text) {
    await supabaseAdmin
      .from("vault_items")
      .update({
        text_extracted: false,
        chunk_count: 0,
        ingest_error: item.file_url
          ? `unsupported file type for extraction: ${item.file_type || "unknown"}`
          : "no extractable text in vault_items.content",
      })
      .eq("id", itemId);
    return { itemId, chunkCount: 0, skipped: "no-content" };
  }

  // Use page-aware chunks if available, otherwise fall back to flat chunking
  const chunksWithPages = pageChunks ?? chunkTextWithPages([text]);
  if (chunksWithPages.length === 0) {
    return { itemId, chunkCount: 0, skipped: "no-content" };
  }

  const chunkTexts = chunksWithPages.map((c) => c.content);
  const vectors = await embedTexts(chunkTexts);

  const rows = chunksWithPages.map((chunk, i) => ({
    item_id: item.id,
    workspace_id: item.workspace_id,
    chunk_index: i,
    page_number: chunk.page_number,
    content: chunk.content,
    embedding: toPgVector(vectors[i]),
    line_start: chunk.line_start,
    line_end: chunk.line_end,
    char_start: chunk.char_start,
    char_end: chunk.char_end,
  }));

  // Upsert instead of DELETE+INSERT to avoid race condition where a
  // crash between DELETE and INSERT leaves zero chunks for the item.
  // The unique constraint on (item_id, chunk_index) makes this safe.
  const insertClient = adminClient(120_000);
  const BATCH = 5;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error: insertErr } = await insertClient
      .from("vault_item_chunks")
      .upsert(rows.slice(i, i + BATCH), {
        onConflict: "item_id,chunk_index",
      });
    if (insertErr) {
      await supabaseAdmin
        .from("vault_items")
        .update({
          text_extracted: false,
          ingest_error: `chunk insert failed: ${insertErr.message}`,
        })
        .eq("id", itemId);
      throw new Error(`Chunk insert: ${insertErr.message}`);
    }
  }

  // Clean up stale chunks from a previous run that had more chunks
  await supabaseAdmin
    .from("vault_item_chunks")
    .delete()
    .eq("item_id", itemId)
    .gte("chunk_index", chunksWithPages.length);

  await supabaseAdmin
    .from("vault_items")
    .update({
      text_extracted: true,
      chunk_count: chunksWithPages.length,
      ingest_error: null,
    })
    .eq("id", itemId);

  // Autonomous pipeline: classify the freshly-indexed document and run
  // the matching analysis (e.g. auto-underwrite a rent roll). Fire-and-
  // forget and dynamically imported so it can never block or break
  // ingestion. Idempotent (skips if an analysis already exists).
  import("@/lib/autopilot/analyze")
    .then((m) => m.runAutopilotForItem(itemId))
    .catch((e) => console.error("[autopilot] failed:", e instanceof Error ? e.message : e));

  return { itemId, chunkCount: chunksWithPages.length };
}

async function downloadAndExtractWithPages(
  fileUrl: string,
  fileType: string | null,
): Promise<{ fullText: string; pages: string[] | null }> {
  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error(`fetch ${res.status}`);
  }
  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  const mt = fileType || res.headers.get("content-type") || "";

  // Page-aware extraction for PDFs and multi-sheet spreadsheets
  const mtLower = mt.toLowerCase();
  const usePageAware = mtLower === "application/pdf"
    || mtLower === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    || mtLower === "application/vnd.ms-excel"
    || mtLower === "xlsx"
    || mtLower === "xls";
  if (usePageAware) {
    const { pages, pageCount } = await extractTextWithPages(buffer, mt);
    const fullText = pages.join("\n\n");
    return { fullText, pages: pageCount > 1 ? pages : null };
  }

  // Single-page formats (docx, plain text, etc.)
  const { text } = await extractText(buffer, mt);
  return { fullText: text, pages: null };
}

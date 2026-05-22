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

const CHUNK_WORDS = 500;
const CHUNK_OVERLAP = 50;
const MAX_CHUNKS_PER_ITEM = 800; // safety: ~400k words
const MAX_CHUNK_CHARS = 3000; // dense tabular data tokenizes at ~2 chars/token

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

interface ChunkWithPage {
  content: string;
  /** 1-based page number for the primary page this chunk came from, or null. */
  page_number: number | null;
}

function chunkText(text: string): string[] {
  return chunkTextWithPages([text]).map((c) => c.content);
}

/**
 * Page-aware chunking. Takes per-page text arrays and produces chunks
 * that track which page they primarily belong to. A chunk that spans
 * a page boundary is assigned the page it started on.
 *
 * This is the core improvement for vault.cite: when the agent searches
 * the vault, returned chunks carry real page numbers, so the citation
 * can say "Section 4.2, p. 7" instead of just "Section 4.2".
 */
function chunkTextWithPages(pages: string[]): ChunkWithPage[] {
  if (pages.length === 0) return [];

  // Build a flat word list with page provenance
  const wordEntries: Array<{ word: string; page: number }> = [];
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const cleaned = (pages[pageIdx] || "").replace(/\u00a0/g, " ").trim();
    if (!cleaned) continue;
    const words = cleaned.split(/\s+/);
    for (const w of words) {
      wordEntries.push({ word: w, page: pageIdx + 1 }); // 1-based
    }
  }

  if (wordEntries.length === 0) return [];

  const rawChunks: ChunkWithPage[] = [];

  if (wordEntries.length <= CHUNK_WORDS) {
    rawChunks.push({
      content: wordEntries.map((e) => e.word).join(" "),
      page_number: wordEntries[0].page,
    });
  } else {
    const stride = CHUNK_WORDS - CHUNK_OVERLAP;
    for (let i = 0; i < wordEntries.length; i += stride) {
      const slice = wordEntries.slice(i, i + CHUNK_WORDS);
      if (slice.length === 0) break;
      rawChunks.push({
        content: slice.map((e) => e.word).join(" "),
        page_number: slice[0].page,
      });
      if (rawChunks.length >= MAX_CHUNKS_PER_ITEM) break;
      if (i + CHUNK_WORDS >= wordEntries.length) break;
    }
  }

  // Split any chunk that exceeds the character limit (spreadsheets
  // with dense numeric data can be few words but many tokens)
  const chunks: ChunkWithPage[] = [];
  for (const c of rawChunks) {
    if (c.content.length <= MAX_CHUNK_CHARS) {
      chunks.push(c);
    } else {
      for (let off = 0; off < c.content.length; off += MAX_CHUNK_CHARS) {
        chunks.push({
          content: c.content.slice(off, off + MAX_CHUNK_CHARS),
          page_number: c.page_number,
        });
      }
    }
    if (chunks.length >= MAX_CHUNKS_PER_ITEM) break;
  }

  return chunks;
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
  let pageChunks: ChunkWithPage[] | null = null;

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
    || mtLower === "application/vnd.ms-excel";
  if (usePageAware) {
    const { pages, pageCount } = await extractTextWithPages(buffer, mt);
    const fullText = pages.join("\n\n");
    return { fullText, pages: pageCount > 1 ? pages : null };
  }

  // Single-page formats (docx, plain text, etc.)
  const { text } = await extractText(buffer, mt);
  return { fullText: text, pages: null };
}

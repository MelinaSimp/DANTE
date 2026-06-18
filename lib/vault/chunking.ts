// lib/vault/chunking.ts
//
// Page- and line-aware chunking for vault ingestion. Pure (no DB, no
// network) so it can be unit-tested directly and shared between the
// ingest worker and any future re-chunk path. Offsets are computed
// against normalizePageText() output — the same normalization the
// source-page viewer uses — so a stored (page, line_start..line_end)
// maps to the exact lines the viewer highlights.

import { normalizePageText } from "@/lib/vault/extract";

export const CHUNK_WORDS = 500;
export const CHUNK_OVERLAP = 50;
export const MAX_CHUNKS_PER_ITEM = 800; // safety: ~400k words
export const MAX_CHUNK_CHARS = 3000; // dense tabular data tokenizes at ~2 chars/token

export interface ChunkWithProvenance {
  content: string;
  /** 1-based page number for the primary page this chunk came from, or null. */
  page_number: number | null;
  /** 1-based first/last line within the primary page's normalized text. */
  line_start: number | null;
  line_end: number | null;
  /** 0-based / exclusive char offsets within the primary page's normalized text. */
  char_start: number | null;
  char_end: number | null;
}

/** Count newline chars in s[0, end). */
function countNewlines(s: string, end: number): number {
  let n = 0;
  const lim = Math.min(end, s.length);
  for (let i = 0; i < lim; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
}

/**
 * Page- and line-aware chunking. Takes per-page text arrays and produces
 * chunks that track which page they primarily belong to AND the line +
 * character span within that page. A chunk that spans a page boundary is
 * assigned the page it started on, and its span covers the portion on
 * that primary page.
 */
export function chunkTextWithPages(pages: string[]): ChunkWithProvenance[] {
  if (pages.length === 0) return [];

  // Normalize once; offsets/line numbers are relative to this text.
  const pageTexts = pages.map((p) => normalizePageText(p || ""));

  // Flat word list, each word carrying its page + char span on that page.
  interface WordEntry { word: string; page: number; cs: number; ce: number }
  const wordEntries: WordEntry[] = [];
  for (let p = 0; p < pageTexts.length; p++) {
    const t = pageTexts[p];
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      wordEntries.push({ word: m[0], page: p + 1, cs: m.index, ce: m.index + m[0].length });
    }
  }
  if (wordEntries.length === 0) return [];

  // Provenance for a slice: primary page = first word's page; span covers
  // the leading run of words on that page (words are in reading order).
  const provFor = (slice: WordEntry[]): ChunkWithProvenance => {
    const page = slice[0].page;
    const cs = slice[0].cs;
    let ce = slice[0].ce;
    for (const e of slice) {
      if (e.page !== page) break;
      ce = e.ce;
    }
    const t = pageTexts[page - 1] || "";
    return {
      content: slice.map((e) => e.word).join(" "),
      page_number: page,
      char_start: cs,
      char_end: ce,
      line_start: countNewlines(t, cs) + 1,
      line_end: countNewlines(t, Math.max(cs, ce - 1)) + 1,
    };
  };

  const rawChunks: ChunkWithProvenance[] = [];
  if (wordEntries.length <= CHUNK_WORDS) {
    rawChunks.push(provFor(wordEntries));
  } else {
    const stride = CHUNK_WORDS - CHUNK_OVERLAP;
    for (let i = 0; i < wordEntries.length; i += stride) {
      const slice = wordEntries.slice(i, i + CHUNK_WORDS);
      if (slice.length === 0) break;
      rawChunks.push(provFor(slice));
      if (rawChunks.length >= MAX_CHUNKS_PER_ITEM) break;
      if (i + CHUNK_WORDS >= wordEntries.length) break;
    }
  }

  // Split any chunk that exceeds the character limit (spreadsheets with
  // dense numeric data can be few words but many tokens). Sub-splits
  // inherit the parent's page/line/char provenance.
  const chunks: ChunkWithProvenance[] = [];
  for (const c of rawChunks) {
    if (c.content.length <= MAX_CHUNK_CHARS) {
      chunks.push(c);
    } else {
      for (let off = 0; off < c.content.length; off += MAX_CHUNK_CHARS) {
        chunks.push({ ...c, content: c.content.slice(off, off + MAX_CHUNK_CHARS) });
      }
    }
    if (chunks.length >= MAX_CHUNKS_PER_ITEM) break;
  }

  return chunks;
}

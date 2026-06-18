// Vault text extraction.
//
// Pulls plain text out of an uploaded file's bytes so the ingest
// pipeline (chunk + embed) has something to work with. Without this,
// every PDF / docx upload sat in the vault un-indexed and
// archive.search returned 0 hits.
//
// Supported formats:
//   PDF  — unpdf (pdfjs-dist stripped of browser canvas deps)
//   DOCX — mammoth (extracts paragraphs as plain text)
//   XLSX — SheetJS (renders each sheet as tab-separated rows)
//   Plain text — decoded directly (txt, md, csv, html, json, xml)

export interface ExtractResult {
  text: string;
  pageCount?: number;
}

export interface PageAwareExtractResult {
  /** Per-page text strings (index = page number - 1). */
  pages: string[];
  pageCount: number;
}

/**
 * Normalize a page's extracted text for stable line/char provenance.
 * Collapses CRLF to LF and non-breaking spaces to regular spaces while
 * preserving newlines so line numbers are deterministic.
 *
 * The vault chunker (which records line_start/line_end/char_* per chunk)
 * and the source-page viewer (which highlights those lines) MUST run this
 * identically, or a stored line range won't map to the same lines on
 * screen. Keep it the single source of truth.
 */
export function normalizePageText(s: string): string {
  return (s || "").replace(/\r\n?/g, "\n").replace(/ /g, " ");
}

const PLAIN_TEXT_MIMES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "text/xml",
  "application/json",
  "application/xml",
]);

const DOCX_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "docx",
  "doc",
]);

const XLSX_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "xlsx",
  "xls",
]);

export async function extractText(
  buffer: Buffer,
  mimeType: string | null,
): Promise<ExtractResult> {
  const mt = (mimeType || "").toLowerCase();

  if (mt === "application/pdf") {
    const { extractText: unpdfExtract } = await import("unpdf");
    const { totalPages, text } = await unpdfExtract(new Uint8Array(buffer), {
      mergePages: true,
    });
    return { text: text || "", pageCount: totalPages };
  }

  if (DOCX_MIMES.has(mt)) {
    return extractDocx(buffer);
  }

  if (XLSX_MIMES.has(mt)) {
    return extractXlsx(buffer);
  }

  if (PLAIN_TEXT_MIMES.has(mt) || mt.startsWith("text/")) {
    return { text: buffer.toString("utf8") };
  }

  // Last resort: try to detect by magic bytes
  return extractByMagicBytes(buffer);
}

/**
 * Extract text from a PDF buffer with per-page separation.
 * Returns an array of strings, one per page. Non-PDF files
 * return a single-element array with the full text.
 *
 * This powers page-aware chunking: each chunk knows which
 * page(s) it came from, so vault.cite can return real page
 * numbers in citations instead of null.
 */
export async function extractTextWithPages(
  buffer: Buffer,
  mimeType: string | null,
): Promise<PageAwareExtractResult> {
  const mt = (mimeType || "").toLowerCase();

  if (mt === "application/pdf") {
    const { extractText: unpdfExtract } = await import("unpdf");
    const { totalPages, text } = await unpdfExtract(new Uint8Array(buffer), {
      mergePages: false,
    });
    const pages = Array.isArray(text) ? text.map((p) => String(p)) : [String(text || "")];
    return { pages, pageCount: totalPages ?? pages.length };
  }

  if (XLSX_MIMES.has(mt)) {
    return extractXlsxWithPages(buffer);
  }

  // docx + plain text: single "page"
  const result = await extractText(buffer, mimeType);
  if (!result.text) return { pages: [], pageCount: 0 };
  return { pages: [result.text], pageCount: 1 };
}

// ── DOCX extraction ──────────────────────────────────────────────

async function extractDocx(buffer: Buffer): Promise<ExtractResult> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value || "" };
  } catch (err) {
    console.error("[extract] docx extraction failed:", err instanceof Error ? err.message : err);
    return { text: "" };
  }
}

// ── XLSX extraction ──────────────────────────────────────────────

function extractXlsx(buffer: Buffer): ExtractResult {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheets: string[] = [];
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;
      const text = XLSX.utils.sheet_to_csv(sheet, { FS: "\t", RS: "\n" });
      if (text.trim()) {
        sheets.push(`--- Sheet: ${name} ---\n${text.trim()}`);
      }
    }
    const fullText = sheets.join("\n\n");
    return { text: fullText, pageCount: workbook.SheetNames.length };
  } catch (err) {
    console.error("[extract] xlsx extraction failed:", err instanceof Error ? err.message : err);
    return { text: "" };
  }
}

function extractXlsxWithPages(buffer: Buffer): PageAwareExtractResult {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const pages: string[] = [];
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;
      const text = XLSX.utils.sheet_to_csv(sheet, { FS: "\t", RS: "\n" });
      pages.push(`Sheet: ${name}\n${text.trim()}`);
    }
    return { pages, pageCount: pages.length };
  } catch (err) {
    console.error("[extract] xlsx page extraction failed:", err instanceof Error ? err.message : err);
    return { pages: [], pageCount: 0 };
  }
}

// ── Magic byte detection ─────────────────────────────────────────
// Handles cases where mime type is wrong or missing (common with
// file watcher uploads that guess mime from extension).

function extractByMagicBytes(buffer: Buffer): Promise<ExtractResult> | ExtractResult {
  if (buffer.length < 4) return { text: "" };

  // ZIP-based formats (docx, xlsx) start with PK\x03\x04
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
    // Peek inside the zip for content type indicators
    const header = buffer.toString("utf8", 0, Math.min(buffer.length, 2000));
    if (header.includes("word/")) {
      return extractDocx(buffer);
    }
    if (header.includes("xl/")) {
      return extractXlsx(buffer);
    }
  }

  // PDF starts with %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return extractText(buffer, "application/pdf");
  }

  return { text: "" };
}

// Vault text extraction.
//
// Pulls plain text out of an uploaded file's bytes so the ingest
// pipeline (chunk + embed) has something to work with. Without this,
// every PDF / docx upload sat in the vault un-indexed and
// archive.search returned 0 hits — the bug that made Vergil say
// "I couldn't find any Medina rent rolls" with a Medina rent roll
// sitting right there in the vault.
//
// PDF: uses unpdf, which bundles a pdfjs-dist build stripped of the
// browser-only canvas dependencies (DOMMatrix, Path2D, etc) that
// crash pdf-parse / vanilla pdfjs-dist in Node / Vercel serverless.
//
// Plain text: decoded directly. docx / xlsx will need mammoth +
// sheetjs and can be added as new branches — return text or empty,
// don't throw, and ingest will record "unsupported file type" cleanly.

export interface ExtractResult {
  text: string;
  pageCount?: number;
}

export interface PageAwareExtractResult {
  /** Per-page text strings (index = page number - 1). */
  pages: string[];
  pageCount: number;
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

  if (PLAIN_TEXT_MIMES.has(mt) || mt.startsWith("text/")) {
    return { text: buffer.toString("utf8") };
  }

  return { text: "" };
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
    // unpdf with mergePages:false returns text as string[] (one per page)
    const pages = Array.isArray(text) ? text.map((p) => String(p)) : [String(text || "")];
    return { pages, pageCount: totalPages ?? pages.length };
  }

  // Non-PDF: single "page"
  const result = await extractText(buffer, mimeType);
  if (!result.text) return { pages: [], pageCount: 0 };
  return { pages: [result.text], pageCount: 1 };
}

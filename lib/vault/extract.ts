// Vault text extraction.
//
// Pulls plain text out of an uploaded file's bytes so the ingest
// pipeline (chunk + embed) has something to work with. Without this,
// every PDF / docx upload sat in the vault un-indexed and
// archive.search returned 0 hits — the bug that made Vergil say
// "I couldn't find any Medina rent rolls" with a Medina rent roll
// sitting right there in the vault.
//
// Today: PDF (via pdf-parse, already a dep) + plain-text formats.
// docx / xlsx will need mammoth + sheetjs and can be added the same
// way — return text or empty, don't throw, and ingest will record
// "no extractable text" gracefully for unsupported types.

// Dynamic import for pdf-parse: importing it at module-load time
// triggers a webpack interop error ("Object.defineProperty called on
// non-object") because the package mixes ESM/CJS and pulls pdfjs-dist
// in eagerly. Loading it lazily inside the function dodges that.

export interface ExtractResult {
  text: string;
  pageCount?: number;
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
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return { text: result.text || "", pageCount: result.total };
    } finally {
      await parser.destroy().catch(() => {});
    }
  }

  if (PLAIN_TEXT_MIMES.has(mt) || mt.startsWith("text/")) {
    return { text: buffer.toString("utf8") };
  }

  return { text: "" };
}

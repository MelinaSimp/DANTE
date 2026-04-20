// lib/dante/archive/extract.ts
//
// File → per-page text extraction for the archive. Focused on the
// three formats a financial-advisory firm actually stores: PDF,
// plain text / markdown, and docx. Everything else is rejected up
// front so we don't silently index garbage.
//
// PDF extraction goes through pdfjs-dist (already installed for the
// viewer elsewhere in the app). pdfjs gives us per-page text streams,
// which we stitch into paragraph-ish blocks. This is good enough for
// retrieval — we don't need perfect layout reconstruction.

import type { PageText } from "./chunk";

const MAX_BYTES = 25 * 1024 * 1024; // 25MB; larger is fine server-side but stalls browsers

export const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
]);

export interface ExtractResult {
  pages: PageText[];
  pageCount: number;
}

export async function extractFile(
  buffer: ArrayBuffer,
  mimeType: string,
): Promise<ExtractResult> {
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error(`File too large (${Math.round(buffer.byteLength / 1024 / 1024)}MB). Max 25MB.`);
  }
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  if (mimeType === "application/pdf") {
    return extractPdf(buffer);
  }
  if (mimeType.startsWith("text/")) {
    const text = new TextDecoder("utf-8").decode(new Uint8Array(buffer));
    return { pages: [{ page: 1, text }], pageCount: 1 };
  }
  // docx
  return extractDocx(buffer);
}

async function extractPdf(buffer: ArrayBuffer): Promise<ExtractResult> {
  // Dynamic import — pdfjs-dist pulls in a fair amount and we only
  // need it on the upload path, not every request into the archive
  // API surface.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Disable the worker — Node/serverless has no window, and pdfjs
  // runs fine without it for text extraction. The typings don't
  // expose `workerSrc` on GlobalWorkerOptions in all published
  // variants, but the field exists at runtime.
  (pdfjs.GlobalWorkerOptions as { workerSrc?: string }).workerSrc = "";

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;

  const pages: PageText[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Stitch the page's text items into paragraph-ish text. pdfjs
    // gives each item a y-position, so we insert a paragraph break
    // when the y-gap is wider than the item height (heuristic).
    type Item = { str: string; transform: number[]; height: number };
    const items = content.items as unknown as Item[];
    let prevY: number | null = null;
    let buf = "";
    for (const it of items) {
      const y = it.transform?.[5] ?? 0;
      const h = it.height || 12;
      if (prevY !== null && Math.abs(prevY - y) > h * 1.4) {
        buf += "\n\n";
      } else if (buf && !buf.endsWith(" ") && !buf.endsWith("\n")) {
        buf += " ";
      }
      buf += it.str || "";
      prevY = y;
    }
    pages.push({ page: p, text: buf });
    page.cleanup();
  }
  return { pages, pageCount: doc.numPages };
}

async function extractDocx(buffer: ArrayBuffer): Promise<ExtractResult> {
  // mammoth is a tiny, zero-config docx → text library. Lazy-imported
  // for the same reason as pdfjs above. Typed loosely because the
  // dependency is optional — if it isn't installed, we fall through
  // to the friendly error below rather than breaking the build.
  type Mammoth = { extractRawText: (opts: { buffer: Uint8Array }) => Promise<{ value: string }> };
  let mammoth: Mammoth;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mammoth = (await import(/* webpackIgnore: true */ "mammoth" as any)) as Mammoth;
  } catch {
    throw new Error(
      ".docx support requires `mammoth` — add it to package.json, or convert to PDF and re-upload.",
    );
  }
  const res = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  // mammoth doesn't expose page boundaries; treat the whole doc as
  // "page 1". Chunking still works on paragraph breaks.
  return { pages: [{ page: 1, text: res.value }], pageCount: 1 };
}

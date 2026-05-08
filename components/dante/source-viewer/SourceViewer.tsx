"use client";

// SourceViewer — slide-in right panel that shows the source PDF
// for a vault citation. Auto-jumps to the cited page and highlights
// the quoted passage with rectangular overlays drawn via react-pdf's
// customTextRenderer hook (matches text layer items against the
// citation's `quote` and wraps them in <mark>).
//
// Two file-fetch paths:
//   1. Cloud-stored vault items (file_url set) → /api/vault/[id]/source
//      streams bytes through the API.
//   2. Watched-folder ingests (file_url null) → API returns
//      { kind: "local", path }, renderer uses the Electron IPC
//      window.electronAPI.vault.readLocalFile to read the bytes
//      from the user's machine.
//
// Layout: the SourceViewerLayout wrapper applies pr-[50%] to the
// chat container when this panel is open, so messages don't slide
// underneath. The panel itself is fixed: right-0, top-0, bottom-0.
//
// PDF rendering: dynamic import of react-pdf (its bundle is heavy
// and Next.js's SSR doesn't play well with react-pdf's pdfjs worker
// setup). The Document only mounts when active is non-null.

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { useSourceViewer, type SourceTarget } from "./SourceViewerContext";

// react-pdf shipped as ESM with a pdfjs worker peer dep. Dynamic
// import keeps it out of the SSR bundle and lets us configure the
// worker before the components mount.
const Document = dynamic(
  () => import("react-pdf").then((m) => m.Document),
  { ssr: false },
);
const Page = dynamic(() => import("react-pdf").then((m) => m.Page), {
  ssr: false,
});

// One-time worker setup. Runs in client only because we feature-
// detect window. The pdfjs worker is copied to /pdf.worker.min.mjs
// by the postinstall script in package.json.
let _workerConfigured = false;
async function configurePdfWorker() {
  if (_workerConfigured || typeof window === "undefined") return;
  const { pdfjs } = await import("react-pdf");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  _workerConfigured = true;
}

type SourceData =
  | { kind: "bytes"; bytes: ArrayBuffer; ext: string }
  | { kind: "local-not-available"; reason: string };

export default function SourceViewer() {
  const { active, close } = useSourceViewer();
  if (!active) return null;
  return <SourceViewerPanel active={active} onClose={close} />;
}

function SourceViewerPanel({
  active,
  onClose,
}: {
  active: SourceTarget;
  onClose: () => void;
}) {
  const [source, setSource] = useState<SourceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [page, setPage] = useState<number>(active.page || 1);
  const [width, setWidth] = useState(720);
  const containerRef = useRef<HTMLDivElement>(null);

  // Resize observer — keep PDF page width matched to panel width.
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setWidth(Math.max(360, Math.floor(w - 32)));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Escape hatches — older RIA users hate hunting for a small X.
  // Esc key closes; click on the dimmed scrim outside the panel
  // also closes. The X button stays as the obvious affordance.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Load source data when the active citation changes. Reset page
  // to the cited page (or 1 if absent).
  useEffect(() => {
    let cancelled = false;
    setSource(null);
    setError(null);
    setNumPages(null);
    setPage(active.page || 1);

    (async () => {
      await configurePdfWorker();
      try {
        const res = await fetch(`/api/vault/${active.documentId}/source`, {
          credentials: "include",
        });
        if (!res.ok) {
          const msg = await res
            .json()
            .then((j: { error?: string }) => j.error)
            .catch(() => `${res.status}`);
          if (!cancelled) setError(msg || "fetch_failed");
          return;
        }
        const ct = res.headers.get("Content-Type") || "";
        if (ct.includes("application/json")) {
          // Local-file response from the API. Read via Electron IPC.
          const meta = (await res.json()) as {
            kind: "local";
            path: string;
            extension?: string | null;
            title?: string;
          };
          const ipc = window.electronAPI?.vault;
          if (!ipc?.readLocalFile) {
            if (!cancelled)
              setSource({
                kind: "local-not-available",
                reason: "needs_electron_v1_3",
              });
            return;
          }
          const r = await ipc.readLocalFile(meta.path);
          if (cancelled) return;
          if ("error" in r && r.error) {
            setError(r.error);
            return;
          }
          if ("bytes" in r && r.bytes) {
            setSource({
              kind: "bytes",
              bytes: r.bytes,
              ext: (meta.extension || "pdf").toLowerCase().replace(/^\./, ""),
            });
            return;
          }
          setError("local_file_read_returned_no_bytes");
          return;
        }
        const bytes = await res.arrayBuffer();
        if (!cancelled) {
          setSource({
            kind: "bytes",
            bytes,
            ext: ct.includes("pdf") ? "pdf" : "bin",
          });
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "fetch_failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active.documentId, active.page]);

  // ─── Highlight: build a per-page text-layer renderer ─────────
  //
  // react-pdf calls customTextRenderer for each text item in the
  // text layer. We match items against the citation's quote and
  // wrap matching ones in <mark> with our highlight class.
  //
  // Strategy: cumulatively join all item.str values, find the
  // quote within that joined string (case + whitespace insensitive),
  // mark items whose offset range overlaps the match. Recomputed
  // per page when textItems change.
  const normalizedQuote = useMemo(
    () => normalize(active.quote || ""),
    [active.quote],
  );
  const matchedItemIdsRef = useRef<Set<number>>(new Set());

  const customTextRenderer = useMemo(() => {
    if (!normalizedQuote) return undefined;
    return (props: { itemIndex: number; str: string }) => {
      if (matchedItemIdsRef.current.has(props.itemIndex)) {
        return `<mark class="source-viewer-mark">${escapeHtml(props.str)}</mark>`;
      }
      return escapeHtml(props.str);
    };
  }, [normalizedQuote]);

  const onPageRenderSuccess = async (pageProxy: unknown) => {
    if (!normalizedQuote) return;
    try {
      const pp = pageProxy as { getTextContent: () => Promise<{ items: unknown[] }> };
      const tc = await pp.getTextContent();
      const items = tc.items as Array<{ str?: string }>;
      let cumulative = "";
      const offsets: Array<{ start: number; end: number }> = [];
      for (const item of items) {
        const s = item.str || "";
        offsets.push({ start: cumulative.length, end: cumulative.length + s.length });
        cumulative += s + " ";
      }
      const haystack = normalize(cumulative);
      // Try exact match; fall back to first 80 chars of the quote
      // for cases where the quote is longer than what's on this
      // page or has extra trailing context.
      let matchStart = haystack.indexOf(normalizedQuote);
      if (matchStart < 0 && normalizedQuote.length > 80) {
        matchStart = haystack.indexOf(normalizedQuote.slice(0, 80));
      }
      if (matchStart < 0) {
        matchedItemIdsRef.current = new Set();
        return;
      }
      // Map normalized offset back to raw cumulative offset is
      // complex; use a per-item normalized accumulation instead.
      let normCursor = 0;
      const itemNormRanges: Array<{ start: number; end: number }> = [];
      for (const item of items) {
        const s = normalize((item.str || "") + " ");
        itemNormRanges.push({ start: normCursor, end: normCursor + s.length });
        normCursor += s.length;
      }
      const matchEnd = matchStart + normalizedQuote.length;
      const matched = new Set<number>();
      itemNormRanges.forEach((r, i) => {
        if (r.end > matchStart && r.start < matchEnd) matched.add(i);
      });
      matchedItemIdsRef.current = matched;
    } catch {
      /* highlight is best-effort */
    }
  };

  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(numPages || 1, p + 1));

  return (
    <>
      {/* Scrim — covers the chat surface to the left of the panel.
          Click anywhere on the dim → close. Pointer-events on the
          scrim itself, not on the panel. */}
      <div
        className="fixed inset-y-0 left-0 right-1/2 z-30 bg-black/10"
        aria-hidden
        onClick={onClose}
      />
    <aside
      className="fixed right-0 top-0 bottom-0 w-1/2 z-40 border-l border-[var(--rule)] bg-[var(--canvas)] shadow-xl flex flex-col"
      role="dialog"
      aria-label={`Source: ${active.title}`}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--rule)]">
        <div className="min-w-0 flex-1">
          <div className="mono text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">
            {active.marker || "Source"} · {active.page ? `Page ${active.page}` : "Page —"}
          </div>
          <div className="text-sm font-medium truncate">{active.title}</div>
        </div>
        <div className="flex items-center gap-1">
          {numPages && (
            <>
              <button
                onClick={goPrev}
                disabled={page <= 1}
                className="p-1.5 rounded hover:bg-[var(--rule)]/30 disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="mono text-[11px] text-[var(--ink-muted)] min-w-[60px] text-center">
                {page} / {numPages}
              </span>
              <button
                onClick={goNext}
                disabled={page >= numPages}
                className="p-1.5 rounded hover:bg-[var(--rule)]/30 disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
          {/* Bigger, labeled close — old-RIA discoverability over
              icon-only minimalism. Esc and click-outside both also
              close, but the explicit button stays the primary affordance. */}
          <button
            onClick={onClose}
            className="ml-1 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-[var(--ink-muted)] hover:bg-[var(--rule)]/30 hover:text-[var(--ink)]"
            aria-label="Close source viewer (Esc)"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" strokeWidth={2} />
            <span>Close</span>
          </button>
        </div>
      </header>

      <div ref={containerRef} className="flex-1 overflow-auto bg-[var(--rule)]/10">
        {!source && !error && (
          <div className="flex items-center justify-center h-full text-sm text-[var(--ink-muted)]">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Loading source…
          </div>
        )}
        {error && (
          <div className="p-6 text-sm text-[var(--ink-muted)]">
            <div className="text-[var(--ink)] font-medium mb-1">
              Couldn&rsquo;t load this source
            </div>
            <div className="mono text-[11px]">{error}</div>
          </div>
        )}
        {source?.kind === "local-not-available" && (
          <div className="p-6 text-sm text-[var(--ink-muted)]">
            <div className="text-[var(--ink)] font-medium mb-2">
              Source viewer needs a desktop-app update
            </div>
            <p className="leading-relaxed">
              This file lives on your machine (auto-ingested via watched
              folder). Drift v1.3+ will read it back through the Electron
              IPC bridge and render it here. For now, open the file in
              Finder using the path in the description.
            </p>
          </div>
        )}
        {source?.kind === "bytes" && source.ext === "pdf" && (
          <div className="flex justify-center py-4">
            <Document
              file={source.bytes}
              onLoadSuccess={({ numPages: n }: { numPages: number }) => {
                setNumPages(n);
                if (active.page && active.page <= n) setPage(active.page);
              }}
              onLoadError={(err: Error) => setError(err.message)}
              loading={
                <div className="text-sm text-[var(--ink-muted)] py-8">
                  Decoding PDF…
                </div>
              }
            >
              <Page
                pageNumber={page}
                width={width}
                renderTextLayer
                renderAnnotationLayer={false}
                onRenderSuccess={onPageRenderSuccess}
                customTextRenderer={customTextRenderer}
              />
            </Document>
          </div>
        )}
        {source?.kind === "bytes" &&
          (source.ext === "txt" ||
            source.ext === "md" ||
            source.ext === "csv" ||
            source.ext === "log" ||
            source.ext === "json" ||
            source.ext === "yaml" ||
            source.ext === "yml") && (
            <TextSourcePreview bytes={source.bytes} quote={active.quote || ""} />
          )}
        {source?.kind === "bytes" && (source.ext === "docx" || source.ext === "doc") && (
          <DocxSourcePreview bytes={source.bytes} quote={active.quote || ""} />
        )}
        {source?.kind === "bytes" &&
          source.ext !== "pdf" &&
          source.ext !== "docx" &&
          source.ext !== "doc" &&
          !["txt", "md", "csv", "log", "json", "yaml", "yml"].includes(
            source.ext,
          ) && (
            <div className="p-6 text-sm text-[var(--ink-muted)]">
              <div className="text-[var(--ink)] font-medium mb-2">
                {source.ext.toUpperCase()} preview not yet supported
              </div>
              <p>
                Inline rendering for this file type is on the roadmap. Open
                the original file directly to view it.
              </p>
            </div>
          )}
      </div>

      <style jsx global>{`
        .source-viewer-mark {
          background-color: rgba(250, 204, 21, 0.45);
          color: inherit;
          border-radius: 1px;
          padding: 0;
        }
      `}</style>
    </aside>
    </>
  );
}

/**
 * Renders plain-text source files (.txt, .md, .csv, .log, .json,
 * .yaml) with the cited passage highlighted. Auto-scrolls the
 * highlight into view on mount. Uses normalized matching so whitespace
 * differences between the chunked snippet and the raw file don't
 * miss legitimate hits.
 */
function TextSourcePreview({
  bytes,
  quote,
}: {
  bytes: ArrayBuffer;
  quote: string;
}) {
  const text = useMemo(() => {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return "(failed to decode as UTF-8)";
    }
  }, [bytes]);

  const segments = useMemo(() => {
    return splitWithHighlight(text, quote);
  }, [text, quote]);

  const markRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (markRef.current) {
      markRef.current.scrollIntoView({ behavior: "auto", block: "center" });
    }
  }, [segments]);

  return (
    <div className="p-6">
      <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-[var(--ink)]">
        {segments.map((seg, i) =>
          seg.match ? (
            <mark
              key={i}
              ref={i === segments.findIndex((s) => s.match) ? markRef : undefined}
              className="bg-yellow-200/70 dark:bg-yellow-500/30 rounded-[1px]"
            >
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </pre>
    </div>
  );
}

/**
 * Find the cited quote inside the raw text and split into match /
 * non-match segments. Normalized matching (lowercase + whitespace
 * collapse) for the SEARCH only; the returned segments preserve
 * original casing + whitespace for display.
 */
function splitWithHighlight(
  text: string,
  rawQuote: string,
): Array<{ text: string; match: boolean }> {
  if (!rawQuote.trim()) return [{ text, match: false }];
  const normText = normalize(text);
  const normQuote = normalize(rawQuote);
  if (!normQuote) return [{ text, match: false }];

  // Try the full quote first; fall back to first 80 chars for
  // citations that include trailing context not present in the file.
  let normIdx = normText.indexOf(normQuote);
  let normLen = normQuote.length;
  if (normIdx < 0 && normQuote.length > 80) {
    const slice = normQuote.slice(0, 80);
    normIdx = normText.indexOf(slice);
    normLen = slice.length;
  }
  if (normIdx < 0) return [{ text, match: false }];

  // Walk the original text accumulating normalized length until we
  // reach the match start + end; gives us the original-text offsets.
  let normCursor = 0;
  let rawStart = -1;
  let rawEnd = -1;
  let i = 0;
  while (i < text.length) {
    if (normCursor === normIdx && rawStart < 0) rawStart = i;
    if (normCursor >= normIdx + normLen && rawEnd < 0) {
      rawEnd = i;
      break;
    }
    const ch = text[i];
    if (/\s/.test(ch)) {
      // Skip runs of whitespace as a single space in the normalized form.
      if (i > 0 && /\s/.test(text[i - 1])) {
        // already counted
      } else {
        normCursor += 1;
      }
    } else {
      normCursor += 1;
    }
    i++;
  }
  if (rawEnd < 0) rawEnd = text.length;
  if (rawStart < 0) return [{ text, match: false }];

  return [
    { text: text.slice(0, rawStart), match: false },
    { text: text.slice(rawStart, rawEnd), match: true },
    { text: text.slice(rawEnd), match: false },
  ];
}

/** Normalize text for matching: lowercase, collapse whitespace. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Renders .docx via mammoth.js (browser build). Mammoth converts
 * the document to clean HTML; we drop it into a styled div with the
 * cited quote highlighted using the same normalized-matching pass
 * the text + PDF previews use.
 *
 * Mammoth output is sanitized by mammoth itself (no <script>, no
 * inline event handlers — it's a structural converter, not a
 * passthrough). The HTML lands inside a sandboxed-styling container
 * so the document's own font/size choices don't leak into the
 * surrounding chrome.
 */
function DocxSourcePreview({
  bytes,
  quote,
}: {
  bytes: ArrayBuffer;
  quote: string;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // mammoth ships its browser entry without bundled types; cast
        // through unknown to keep the dynamic-import inline.
        const mammothMod = (await import(
          /* webpackChunkName: "mammoth-browser" */
          "mammoth/mammoth.browser.js" as string
        )) as unknown as { convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> };
        const result = await mammothMod.convertToHtml({ arrayBuffer: bytes });
        if (cancelled) return;
        setHtml(result.value || "<em>(empty document)</em>");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "docx_decode_failed");
      }
    })();
    return () => { cancelled = true; };
  }, [bytes]);

  // Highlight the cited quote inside the rendered HTML by walking
  // text nodes after mammoth has rendered. Same normalized-match
  // strategy as the text preview, but works on the live DOM so we
  // don't have to re-render the full HTML on every quote change.
  useEffect(() => {
    if (!html || !containerRef.current || !quote.trim()) return;
    const root = containerRef.current;
    const fullText = root.innerText || "";
    const normFull = normalize(fullText);
    const normQ = normalize(quote);
    if (!normQ) return;

    let normIdx = normFull.indexOf(normQ);
    let normLen = normQ.length;
    if (normIdx < 0 && normQ.length > 80) {
      const slice = normQ.slice(0, 80);
      normIdx = normFull.indexOf(slice);
      normLen = slice.length;
    }
    if (normIdx < 0) return;

    // Walk text nodes; when the cumulative normalized offset enters
    // the match window, wrap the slice of that node in a <mark>.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let normCursor = 0;
    let firstMark: HTMLElement | null = null;
    const matchEnd = normIdx + normLen;
    const toMark: Array<{ node: Text; start: number; end: number }> = [];
    let node = walker.nextNode() as Text | null;
    while (node) {
      const nodeText = node.nodeValue || "";
      const normNode = normalize(nodeText + " ");
      const nodeStart = normCursor;
      const nodeEnd = normCursor + normNode.length;
      if (nodeEnd > normIdx && nodeStart < matchEnd) {
        // Map the overlap from normalized offsets back to raw offsets
        // in this node. Approximate but good enough for highlighting.
        const overlapStartNorm = Math.max(normIdx, nodeStart) - nodeStart;
        const overlapEndNorm = Math.min(matchEnd, nodeEnd) - nodeStart;
        const ratio = nodeText.length / Math.max(1, normNode.length);
        const rawStart = Math.floor(overlapStartNorm * ratio);
        const rawEnd = Math.min(nodeText.length, Math.ceil(overlapEndNorm * ratio));
        if (rawEnd > rawStart) {
          toMark.push({ node, start: rawStart, end: rawEnd });
        }
      }
      normCursor = nodeEnd;
      if (normCursor >= matchEnd) break;
      node = walker.nextNode() as Text | null;
    }
    // Apply marks bottom-up so node-splitting doesn't shift later
    // walker offsets. Each mark wraps just the matched substring.
    for (const m of toMark.reverse()) {
      const before = m.node.nodeValue!.slice(0, m.start);
      const middle = m.node.nodeValue!.slice(m.start, m.end);
      const after = m.node.nodeValue!.slice(m.end);
      const mark = document.createElement("mark");
      mark.className = "source-viewer-mark";
      mark.textContent = middle;
      const parent = m.node.parentNode;
      if (!parent) continue;
      if (after) parent.insertBefore(document.createTextNode(after), m.node.nextSibling);
      parent.insertBefore(mark, m.node.nextSibling);
      m.node.nodeValue = before;
      if (!firstMark) firstMark = mark;
    }
    if (firstMark) {
      firstMark.scrollIntoView({ behavior: "auto", block: "center" });
    }
  }, [html, quote]);

  if (error) {
    return (
      <div className="p-6 text-sm text-[var(--ink-muted)]">
        <div className="text-[var(--ink)] font-medium mb-1">Couldn&rsquo;t render this DOCX</div>
        <div className="mono text-[11px]">{error}</div>
      </div>
    );
  }
  if (!html) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-[var(--ink-muted)]">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Decoding DOCX…
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div
        ref={containerRef}
        className="docx-preview prose prose-sm max-w-none text-[var(--ink)]"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <style jsx global>{`
        .docx-preview p { margin: 0.6em 0; line-height: 1.55; }
        .docx-preview h1 { font-size: 1.4em; font-weight: 600; margin: 1em 0 0.5em; }
        .docx-preview h2 { font-size: 1.2em; font-weight: 600; margin: 0.9em 0 0.4em; }
        .docx-preview h3 { font-size: 1.05em; font-weight: 600; margin: 0.8em 0 0.3em; }
        .docx-preview table { border-collapse: collapse; margin: 0.8em 0; }
        .docx-preview td, .docx-preview th { border: 1px solid var(--rule); padding: 4px 8px; }
        .docx-preview ul, .docx-preview ol { margin: 0.5em 0; padding-left: 1.5em; }
        .docx-preview li { margin: 0.2em 0; }
      `}</style>
    </div>
  );
}

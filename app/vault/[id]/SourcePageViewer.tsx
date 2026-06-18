"use client";

// SourcePageViewer — renders a document's extracted text one page at a
// time and highlights the exact lines behind a citation. Activated by
// a deep link (/vault/<id>?page=N&lines=a-b) from a citation, or by
// clicking a passage in the provenance list. This is the visible proof
// of line-level traceability: every indexed passage shows "p.N · lines
// a-b" and jumps to those highlighted lines.

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ChevronLeft, ChevronRight, FileText, MapPin } from "lucide-react";

interface Passage {
  chunk_index: number;
  page_number: number | null;
  line_start: number | null;
  line_end: number | null;
  char_start: number | null;
  char_end: number | null;
  preview: string;
}

interface LineRange {
  start: number;
  end: number;
}

export default function SourcePageViewer({ itemId }: { itemId: string }) {
  const [passages, setPassages] = useState<Passage[] | null>(null);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [lineRange, setLineRange] = useState<LineRange | null>(null);
  const [pageText, setPageText] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [loadingPage, setLoadingPage] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const highlightRef = useRef<HTMLDivElement | null>(null);

  // Load the provenance list once.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/vault/${itemId}/chunks`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { chunks: [] }))
      .then((d) => {
        if (!cancelled) setPassages(Array.isArray(d.chunks) ? d.chunks : []);
      })
      .catch(() => {
        if (!cancelled) setPassages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const fetchPage = useCallback(
    async (n: number, range: LineRange | null) => {
      setLoadingPage(true);
      setPageError(null);
      setSelectedPage(n);
      setLineRange(range);
      try {
        const r = await fetch(`/api/vault/${itemId}/page?n=${n}`, { credentials: "include" });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not load page");
        setPageText(typeof d.text === "string" ? d.text : "");
        setPageCount(d.pageCount || 0);
      } catch (e) {
        setPageText(null);
        setPageError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoadingPage(false);
      }
    },
    [itemId],
  );

  // Honor a deep link from a citation: ?page=N&lines=a-b
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const pageParam = sp.get("page");
    if (!pageParam) return;
    const n = parseInt(pageParam, 10);
    if (!Number.isFinite(n) || n < 1) return;
    let range: LineRange | null = null;
    const linesParam = sp.get("lines");
    if (linesParam) {
      const m = linesParam.match(/^(\d+)(?:-(\d+))?$/);
      if (m) {
        const start = parseInt(m[1], 10);
        const end = m[2] ? parseInt(m[2], 10) : start;
        range = { start, end };
      }
    }
    fetchPage(n, range);
  }, [fetchPage]);

  // Scroll the first highlighted line into view once the page renders.
  useEffect(() => {
    if (pageText && lineRange && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [pageText, lineRange]);

  // Don't clutter documents that have no indexed passages.
  if (passages !== null && passages.length === 0) return null;

  const lines = pageText != null ? pageText.split("\n") : [];

  return (
    <section className="card-flat overflow-hidden">
      <div className="px-5 py-3 border-b border-[var(--rule)] flex items-center justify-between">
        <div>
          <div className="label-section">Source &amp; provenance</div>
          <p className="text-[11px] text-[var(--ink-subtle)] mt-0.5">
            {passages === null
              ? "Loading indexed passages…"
              : `${passages.length} indexed passage${passages.length === 1 ? "" : "s"}${pageCount ? ` · ${pageCount} page${pageCount === 1 ? "" : "s"}` : ""} — every passage traces to its exact page and line`}
          </p>
        </div>
        {selectedPage != null && pageCount > 0 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => fetchPage(Math.max(1, (selectedPage ?? 1) - 1), null)}
              disabled={loadingPage || (selectedPage ?? 1) <= 1}
              className="p-1.5 rounded-[var(--r-input)] border border-[var(--rule)] text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] disabled:opacity-40 transition"
              title="Previous page"
            >
              <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
            <span className="mono text-[11px] text-[var(--ink-muted)] px-1.5 whitespace-nowrap">
              Page {selectedPage} of {pageCount}
            </span>
            <button
              onClick={() => fetchPage(Math.min(pageCount, (selectedPage ?? 1) + 1), null)}
              disabled={loadingPage || (selectedPage ?? 1) >= pageCount}
              className="p-1.5 rounded-[var(--r-input)] border border-[var(--rule)] text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] disabled:opacity-40 transition"
              title="Next page"
            >
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr]">
        {/* Passage list */}
        <div className="border-b lg:border-b-0 lg:border-r border-[var(--rule)] max-h-[520px] overflow-y-auto">
          {passages === null ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--ink-subtle)]" strokeWidth={1.5} />
            </div>
          ) : (
            <ul className="divide-y divide-[var(--rule)]">
              {passages.map((p) => {
                const hasLines = p.line_start != null && p.line_end != null;
                const range: LineRange | null = hasLines
                  ? { start: p.line_start as number, end: p.line_end as number }
                  : null;
                const active =
                  selectedPage === p.page_number &&
                  lineRange?.start === range?.start &&
                  lineRange?.end === range?.end;
                return (
                  <li key={p.chunk_index}>
                    <button
                      onClick={() => p.page_number && fetchPage(p.page_number, range)}
                      disabled={!p.page_number}
                      className={`w-full text-left px-4 py-3 transition ${
                        active ? "bg-[var(--neu-active)]" : "hover:bg-[var(--canvas-subtle)]"
                      } disabled:opacity-50`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <MapPin className="w-3 h-3 text-[var(--ink-subtle)] shrink-0" strokeWidth={1.5} />
                        <span className="mono text-[11px] text-[var(--ink-muted)]">
                          {p.page_number ? `p.${p.page_number}` : "p.?"}
                          {hasLines && ` · lines ${p.line_start}–${p.line_end}`}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--ink-muted)] line-clamp-2 leading-snug">
                        {p.preview || "—"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Page text + highlight */}
        <div className="max-h-[520px] overflow-y-auto bg-[var(--canvas-subtle)]">
          {loadingPage ? (
            <div className="flex items-center justify-center py-16 text-[var(--ink-subtle)]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" strokeWidth={1.5} />
              <span className="text-sm">Loading page…</span>
            </div>
          ) : pageError ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <FileText className="w-5 h-5 text-[var(--ink-subtle)] mb-2" strokeWidth={1.5} />
              <p className="text-sm text-[var(--ink-muted)] max-w-sm">{pageError}</p>
            </div>
          ) : pageText == null ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <FileText className="w-5 h-5 text-[var(--ink-subtle)] mb-2" strokeWidth={1.5} />
              <p className="text-sm text-[var(--ink-muted)] max-w-sm">
                Select a passage to view its source page with the cited lines highlighted.
              </p>
            </div>
          ) : (
            <div className="py-2">
              {lines.map((line, i) => {
                const lineNo = i + 1;
                const highlighted =
                  lineRange != null && lineNo >= lineRange.start && lineNo <= lineRange.end;
                const isFirstHighlight = highlighted && lineNo === lineRange!.start;
                return (
                  <div
                    key={i}
                    ref={isFirstHighlight ? highlightRef : undefined}
                    className={`flex gap-3 px-4 ${
                      highlighted ? "bg-[var(--flag-soft)] border-l-2 border-[var(--flag)]" : "border-l-2 border-transparent"
                    }`}
                  >
                    <span className="mono text-[10px] text-[var(--ink-subtle)] select-none w-8 shrink-0 text-right pt-0.5">
                      {lineNo}
                    </span>
                    <span className="mono text-xs text-[var(--ink)] whitespace-pre-wrap break-words leading-relaxed">
                      {line || " "}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

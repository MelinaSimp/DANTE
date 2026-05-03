"use client";

// app/dante/MarkdownRenderer.tsx
//
// Renders an assistant message that may contain inline markdown
// tables. Splits the content into segments — text segments go
// through CitationRenderer (so [v1] / [mem:abc] chips still work),
// table segments render as proper HTML tables with each cell also
// going through CitationRenderer so cell-level citations are
// clickable.
//
// We do NOT use a full markdown library (rehype/remark). The model's
// output is constrained enough that table detection + bold/italic
// passthrough is plenty, and avoiding the dependency keeps the
// bundle slim.

import CitationRenderer, { type CitationReport } from "./CitationRenderer";

interface Props {
  content: string;
  trace: unknown;
  /** Validator output — passed through to CitationRenderer for chip
   *  decoration. Null/undefined while validating or unsupported. */
  citationReport?: CitationReport | null;
}

interface Segment {
  type: "text" | "table";
  content: string;
}

export default function MarkdownRenderer({ content, trace, citationReport }: Props) {
  const segments = splitTablesOut(content);

  return (
    <div className="space-y-4">
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <CitationRenderer
            key={i}
            content={seg.content}
            trace={trace}
            // Only attach the report to the first text segment so the
            // overall summary line appears once, not per-segment.
            citationReport={i === 0 ? citationReport : null}
          />
        ) : (
          <TableSegment key={i} markdown={seg.content} trace={trace} />
        ),
      )}
    </div>
  );
}

// ── Table segment ────────────────────────────────────────────────

function TableSegment({ markdown, trace }: { markdown: string; trace: unknown }) {
  const parsed = parseMarkdownTable(markdown);
  if (!parsed) {
    // Bail to plain renderer if parsing failed (e.g. malformed table).
    return <CitationRenderer content={markdown} trace={trace} />;
  }
  return (
    <div className="overflow-x-auto rounded-[6px] border border-[var(--rule)]">
      <table className="w-full text-xs">
        <thead className="bg-[var(--canvas-subtle)]">
          <tr>
            {parsed.headers.map((h, i) => (
              <th
                key={i}
                className="text-left font-medium text-[var(--ink)] px-3 py-2 border-b border-[var(--rule)]"
              >
                <CitationRenderer content={h} trace={trace} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {parsed.rows.map((row, ri) => (
            <tr
              key={ri}
              className="hover:bg-[var(--canvas-subtle)]/50 transition border-b border-[var(--rule)]/50 last:border-0"
            >
              {row.map((cell, ci) => (
                <td key={ci} className="align-top px-3 py-2 text-[var(--ink)]">
                  <CitationRenderer content={cell} trace={trace} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Parsing ──────────────────────────────────────────────────────

/**
 * Walks content line-by-line, accumulating runs of either text or
 * table lines. A "table" run is a header row, a separator row
 * (`|---|---|`), and at least one data row. Anything else is text.
 */
function splitTablesOut(content: string): Segment[] {
  const lines = content.split("\n");
  const segments: Segment[] = [];

  let i = 0;
  let textBuf: string[] = [];

  const flushText = () => {
    if (textBuf.length === 0) return;
    const joined = textBuf.join("\n").trim();
    if (joined) segments.push({ type: "text", content: joined });
    textBuf = [];
  };

  while (i < lines.length) {
    if (looksLikeTableStart(lines, i)) {
      flushText();
      // Greedily consume table lines.
      const start = i;
      while (i < lines.length && /^\s*\|/.test(lines[i])) i++;
      segments.push({ type: "table", content: lines.slice(start, i).join("\n") });
    } else {
      textBuf.push(lines[i]);
      i++;
    }
  }
  flushText();

  return segments;
}

function looksLikeTableStart(lines: string[], i: number): boolean {
  const header = lines[i];
  const sep = lines[i + 1];
  if (!header || !sep) return false;
  if (!/^\s*\|.*\|/.test(header)) return false;
  // Separator row: pipes around dashes/colons.
  if (!/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(sep)) return false;
  // Need at least one body row.
  return !!lines[i + 2] && /^\s*\|/.test(lines[i + 2]);
}

function parseMarkdownTable(markdown: string): { headers: string[]; rows: string[][] } | null {
  const lines = markdown.split("\n").filter((l) => l.trim());
  if (lines.length < 3) return null;
  const headers = splitRow(lines[0]);
  const rows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (cells.length === 0) continue;
    // Pad or trim to header width so the layout stays sane.
    while (cells.length < headers.length) cells.push("");
    if (cells.length > headers.length) cells.length = headers.length;
    rows.push(cells);
  }
  if (rows.length === 0) return null;
  return { headers, rows };
}

function splitRow(line: string): string[] {
  // Strip leading/trailing pipes, split on unescaped `|`.
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

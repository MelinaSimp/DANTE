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
//
// In addition to plain text and tables, we recognise ```reasoning
// fenced code blocks. The agent emits these to render math /
// step-by-step logic / scenario comparison as Drift's "graphic
// organizer" — see ReasoningBlock.tsx for the schema and rendering.
//
// We also recognise ```map fenced blocks. The agent emits these to
// embed an interactive Google Maps pane (grayscale, glass styling)
// whenever a response references a specific property address.

import CitationRenderer, { type CitationReport } from "./CitationRenderer";
import ReasoningBlock, {
  parseReasoningBlock,
  type ReasoningBlockData,
} from "./ReasoningBlock";
import MapBlock, {
  parseMapBlock,
  type MapBlockData,
} from "./MapBlock";
import WebSourcesBlock, {
  parseSourcesBlock,
  type WebSource,
} from "./WebSourcesBlock";

interface Props {
  content: string;
  trace: unknown;
  /** Validator output — passed through to CitationRenderer for chip
   *  decoration. Null/undefined while validating or unsupported. */
  citationReport?: CitationReport | null;
}

interface Segment {
  type: "text" | "table" | "reasoning" | "heading" | "hr" | "map" | "sources";
  content: string;
  /** Pre-parsed reasoning data when type === 'reasoning'. */
  reasoning?: ReasoningBlockData;
  /** 1–3 when type === 'heading'. */
  headingLevel?: 1 | 2 | 3;
  /** Pre-parsed map data when type === 'map'. */
  map?: MapBlockData;
  /** Pre-parsed web sources when type === 'sources'. */
  webSources?: WebSource[];
}

// Hard emoji strip — defense in depth. The API route strips emojis
// server-side, but persisted messages from before the fix (or edge
// cases like ⭐ U+2B50 that slipped the old regex) still need
// client-side cleanup.
const CLIENT_EMOJI_RE =
  /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;

function stripEmojis(text: string): string {
  return text.replace(CLIENT_EMOJI_RE, "").replace(/  +/g, " ");
}

export default function MarkdownRenderer({ content, trace, citationReport }: Props) {
  const segments = splitTablesOut(stripEmojis(content));

  // Auto-insert a map block when the model mentions a specific street
  // address but didn't emit a ```map block. This catches the common
  // fallback where the model draws ASCII art instead.
  maybeInjectMap(segments);

  // Convert "Sources" heading + numbered URL list into a
  // WebSourcesBlock. Catches yet another model fallback format.
  collapseSourcesList(segments);

  // Track whether we've attached the citation report to a segment yet.
  let reportAttached = false;

  return (
    <div className="space-y-5">
      {segments.map((seg, i) => {
        if (seg.type === "heading") {
          const cls =
            seg.headingLevel === 1
              ? "text-xl font-semibold text-[var(--ink)]"
              : seg.headingLevel === 2
                ? "text-base font-semibold text-[var(--ink)]"
                : "text-sm font-semibold text-[var(--ink)]";
          return (
            <div key={i} className={cls}>
              <CitationRenderer content={seg.content} trace={trace} />
            </div>
          );
        }
        if (seg.type === "hr") {
          return <hr key={i} className="border-t border-[var(--rule)] my-2" />;
        }
        if (seg.type === "text") {
          // Attach the report to the first text segment so the
          // overall summary line appears once, not per-segment.
          const attachReport = !reportAttached;
          reportAttached = true;
          return (
            <CitationRenderer
              key={i}
              content={seg.content}
              trace={trace}
              citationReport={attachReport ? citationReport : null}
            />
          );
        }
        if (seg.type === "reasoning" && seg.reasoning) {
          return <ReasoningBlock key={i} data={seg.reasoning} />;
        }
        if (seg.type === "map" && seg.map) {
          return <MapBlock key={i} data={seg.map} />;
        }
        if (seg.type === "sources" && seg.webSources) {
          return <WebSourcesBlock key={i} sources={seg.webSources} />;
        }
        return <TableSegment key={i} markdown={seg.content} trace={trace} />;
      })}
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
 * Walks content line-by-line, accumulating runs of text, tables, or
 * reasoning blocks. Reasoning blocks are fenced ```reasoning code
 * blocks containing a JSON object — see ReasoningBlock.tsx. Tables
 * are standard markdown pipe tables.
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
    // 1a. Reasoning fenced block — ```reasoning ... ```
    if (/^\s*```\s*reasoning\s*$/i.test(lines[i])) {
      flushText();
      const start = i + 1;
      let end = start;
      while (end < lines.length && !/^\s*```\s*$/.test(lines[end])) end++;
      const body = lines.slice(start, end).join("\n").trim();
      const parsed = parseReasoningBlock(body);
      if (parsed) {
        segments.push({ type: "reasoning", content: body, reasoning: parsed });
      } else {
        // Fall back to rendering the JSON as plain text so the user
        // can see what the agent emitted (and we can debug the
        // schema mismatch).
        segments.push({ type: "text", content: "```\n" + body + "\n```" });
      }
      i = end + 1; // skip past the closing fence
      continue;
    }
    // 1b. Map fenced block — ```map ... ```
    if (/^\s*```\s*map\s*$/i.test(lines[i])) {
      flushText();
      const start = i + 1;
      let end = start;
      while (end < lines.length && !/^\s*```\s*$/.test(lines[end])) end++;
      const body = lines.slice(start, end).join("\n").trim();
      const parsed = parseMapBlock(body);
      if (parsed) {
        segments.push({ type: "map", content: body, map: parsed });
      } else {
        segments.push({ type: "text", content: "```\n" + body + "\n```" });
      }
      i = end + 1;
      continue;
    }
    // 1c. Sources fenced block — ```sources ... ```
    if (/^\s*```\s*sources\s*$/i.test(lines[i])) {
      flushText();
      const start = i + 1;
      let end = start;
      while (end < lines.length && !/^\s*```\s*$/.test(lines[end])) end++;
      const body = lines.slice(start, end).join("\n").trim();
      const parsed = parseSourcesBlock(body);
      if (parsed) {
        segments.push({ type: "sources", content: body, webSources: parsed });
      }
      // If parsing fails, silently drop it — the raw JSON source
      // list is never useful as visible text.
      i = end + 1;
      continue;
    }
    // 1d. Generic code fence — strip ASCII art diagrams. The model
    //     sometimes wraps site maps, floor plans, and corridor
    //     diagrams in bare ``` fences. These render as ugly mono-
    //     spaced text and are redundant when a real map exists.
    if (/^\s*```\s*$/.test(lines[i]) || /^\s*```\w*\s*$/.test(lines[i])) {
      // Check it's not one of our special fences (already handled above).
      if (!/^\s*```\s*(reasoning|map|sources)\s*$/i.test(lines[i])) {
        flushText();
        const start = i + 1;
        let end = start;
        while (end < lines.length && !/^\s*```\s*$/.test(lines[end])) end++;
        const body = lines.slice(start, end).join("\n");
        // If it looks like an ASCII diagram, drop it entirely.
        if (looksLikeAsciiDiagram(body)) {
          i = end + 1;
          continue;
        }
        // Otherwise pass through as text (preserve code blocks the
        // model might use for actual code snippets).
        textBuf.push(...lines.slice(i, end + 1));
        i = end + 1;
        continue;
      }
    }
    // 2. Pipe table — or a sources table masquerading as one.
    if (looksLikeTableStart(lines, i)) {
      flushText();
      const start = i;
      while (i < lines.length && /^\s*\|/.test(lines[i])) i++;
      const tableContent = lines.slice(start, i).join("\n");

      // Check if the preceding segment is a "Sources" heading. If
      // the table also has a URL column, treat it as a web-sources
      // block instead of a plain table. This catches the model's
      // common fallback of dumping a markdown source table even
      // when the prompt tells it to use ```sources.
      const prev = segments[segments.length - 1];
      const isSourcesHeading =
        prev?.type === "heading" && /sources?/i.test(prev.content);
      if (isSourcesHeading) {
        const parsed = tryParseSourcesTable(tableContent);
        if (parsed) {
          // Remove the heading — the WebSourcesBlock has its own.
          segments.pop();
          segments.push({ type: "sources", content: tableContent, webSources: parsed });
          continue;
        }
      }

      segments.push({ type: "table", content: tableContent });
      continue;
    }
    // 3. Heading — # / ## / ###
    const headingMatch = lines[i].match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      flushText();
      segments.push({
        type: "heading",
        content: headingMatch[2].trim(),
        headingLevel: headingMatch[1].length as 1 | 2 | 3,
      });
      i++;
      continue;
    }
    // 4. Horizontal rule — three or more dashes on their own line
    if (/^-{3,}\s*$/.test(lines[i].trim())) {
      flushText();
      segments.push({ type: "hr", content: "" });
      i++;
      continue;
    }
    textBuf.push(lines[i]);
    i++;
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

// ── Sources-list collapse ───────────────────────────────────────
//
// The model sometimes emits sources as a numbered text list under a
// "SOURCES" heading:
//   1. LoopNet — 38000 Euclid Ave: https://www.loopnet.com/...
//   2. City-Data — Willoughby: https://www.city-data.com/...
//
// This post-pass detects that pattern and converts the heading +
// text into a WebSourcesBlock.

function collapseSourcesList(segments: Segment[]): void {
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (seg.type !== "heading" || !/sources?/i.test(seg.content)) continue;

    // Look at the next segment — it should be text containing
    // numbered lines with URLs.
    const next = segments[i + 1];
    if (!next || next.type !== "text") continue;

    const sources = tryParseNumberedSources(next.content);
    if (!sources || sources.length < 2) continue;

    // Replace the heading + text with a single sources segment.
    segments.splice(i, 2, {
      type: "sources",
      content: next.content,
      webSources: sources,
    });
    // Don't advance — the new segment is at position i and the
    // loop will move past it on the next increment.
  }
}

/** Parse a numbered list of sources from plain text.
 *  Matches lines like:
 *    1. Title: https://url
 *    2. Title — Description: https://url
 *    3. [Title](https://url)
 */
function tryParseNumberedSources(text: string): WebSource[] | null {
  const lines = text.split("\n").filter((l) => l.trim());
  const sources: WebSource[] = [];

  for (const line of lines) {
    // Match: N. ... https://...  or  N. ... http://...
    const numMatch = line.match(/^\s*(\d+)\.\s+(.+)/);
    if (!numMatch) continue;

    const n = parseInt(numMatch[1], 10);
    const rest = numMatch[2];

    // Extract URL from the line
    const url = extractUrl(rest);
    if (!url) continue;

    // Title is everything before the URL
    let title = rest
      .replace(/https?:\/\/[^\s)]+/g, "")  // strip URLs
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")  // markdown links -> text
      .replace(/[:\s]+$/, "")  // trailing colon/space
      .replace(/^\*\*|\*\*$/g, "")  // bold markers
      .trim();

    if (!title) title = url;

    let domain: string;
    try {
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      domain = url;
    }

    sources.push({ n, title, url, domain });
  }

  return sources.length >= 2 ? sources : null;
}

// ── ASCII diagram detection ─────────────────────────────────────
//
// The model loves drawing site maps, floor plans, and corridor
// diagrams with box-drawing characters. These are redundant when a
// real Google Maps embed exists and render as ugly monospaced text.

function looksLikeAsciiDiagram(body: string): boolean {
  const lines = body.split("\n");
  if (lines.length < 4) return false;

  // Count lines containing box-drawing or diagram characters.
  let diagramLines = 0;
  for (const line of lines) {
    if (
      /[─│┌┐└┘╔╗╚╝╠╣╦╩╬║═┼├┤┬┴]/.test(line) ||
      /[←→↑↓►◄▸▾▲▼]/.test(line) ||
      // ASCII box-drawing: lines made mostly of |, -, +, =
      /^[\s|+\-=╔╗╚╝║═─│*]+$/.test(line.trim())
    ) {
      diagramLines++;
    }
  }

  // If more than 30% of lines are diagram-like, it's an ASCII drawing.
  return diagramLines / lines.length > 0.3;
}

// ── Map auto-injection ──────────────────────────────────────────
//
// When the model mentions a street address but didn't emit a ```map
// block, insert one automatically so the user gets an interactive
// map instead of ASCII art. We scan the first few text/heading
// segments for a US street address pattern.

const ADDRESS_RE =
  /(\d{1,6}\s+[\w\s.'-]{2,40}(?:Ave(?:nue)?|St(?:reet)?|Rd|Road|Blvd|Boulevard|Dr(?:ive)?|Way|Ln|Lane|Ct|Court|Pl(?:ace)?|Pkwy|Hwy|Pike|Circle|Terrace|Trail)\b[.,]?\s*[\w\s.'-]*,\s*[A-Z]{2}\b(?:\s*\d{5})?)/i;

function maybeInjectMap(segments: Segment[]): void {
  // Already has a map — nothing to do.
  if (segments.some((s) => s.type === "map")) return;

  // Scan all text/heading segments (not just the first few) for a
  // street address. The address might be deep into the response
  // after many section headings.
  let address: string | null = null;
  for (const seg of segments) {
    if (seg.type !== "text" && seg.type !== "heading") continue;
    const match = seg.content.match(ADDRESS_RE);
    if (match) {
      address = match[1].trim().replace(/[.,]+$/, "");
      break;
    }
  }

  if (!address) return;

  // Insert after the first heading (or at position 0).
  const firstHeadingIdx = segments.findIndex((s) => s.type === "heading");
  const insertAt = firstHeadingIdx !== -1 ? firstHeadingIdx + 1 : 0;

  segments.splice(insertAt, 0, {
    type: "map",
    content: JSON.stringify({ address, zoom: 15 }),
    map: { address, zoom: 15 },
  });
}

function splitRow(line: string): string[] {
  // Strip leading/trailing pipes, split on unescaped `|`.
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

// ── Sources-table fallback ─────────────────────────────────────
//
// The model sometimes ignores the ```sources instruction and dumps
// a markdown table with columns like #, Source, URL. This helper
// tries to parse that table into WebSource[] so the renderer can
// display the Perplexity-style panel instead of a raw table.

function tryParseSourcesTable(markdown: string): WebSource[] | null {
  const parsed = parseMarkdownTable(markdown);
  if (!parsed || parsed.rows.length === 0) return null;

  // Identify column indices by header text.
  const hLower = parsed.headers.map((h) => h.toLowerCase());
  const urlCol = hLower.findIndex((h) => /url|link|href/.test(h));
  const titleCol = hLower.findIndex((h) => /source|title|name/.test(h));

  // Must have at least a URL column to qualify.
  if (urlCol === -1) return null;

  const sources: WebSource[] = [];
  for (let r = 0; r < parsed.rows.length; r++) {
    const row = parsed.rows[r];
    const rawUrl = extractUrl(row[urlCol] || "");
    if (!rawUrl) continue;

    const title =
      titleCol !== -1 ? (row[titleCol] || "").replace(/\*\*/g, "").trim() : rawUrl;

    let domain: string;
    try {
      domain = new URL(rawUrl).hostname.replace(/^www\./, "");
    } catch {
      domain = rawUrl;
    }

    // Try to read a number from the first column; fall back to index.
    const numCol = hLower.findIndex((h) => h === "#" || h === "no" || h === "n");
    const n =
      numCol !== -1 ? parseInt(row[numCol], 10) || sources.length + 1 : sources.length + 1;

    sources.push({ n, title, url: rawUrl, domain });
  }

  return sources.length >= 2 ? sources : null;
}

/** Pull a bare URL or a markdown-link URL from a cell. */
function extractUrl(cell: string): string | null {
  // Markdown link: [text](url)
  const mdMatch = cell.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/);
  if (mdMatch) return mdMatch[1];
  // Bare URL
  const bareMatch = cell.match(/(https?:\/\/[^\s|)]+)/);
  if (bareMatch) return bareMatch[1];
  return null;
}

// lib/dante/archive/chunk.ts
//
// Text chunker for the archive. The goal is "semantic-ish" chunks
// ~1000 chars long with ~150 chars of overlap so a concept split
// across two chunks is still retrievable from either side.
//
// Strategy:
//   1. Split by double-newline paragraphs first (preserves sectioning).
//   2. Greedily pack paragraphs into a chunk up to TARGET.
//   3. If a single paragraph is larger than TARGET (common in legal
//      docs with 2-page single-paragraph clauses), fall back to a
//      sentence split, then a hard character split for worst cases.
//   4. Stitch an OVERLAP-char tail from the previous chunk onto the
//      start of the next so retrieval doesn't miss boundary phrases.

const TARGET = 1000;
const OVERLAP = 150;
const MIN = 200; // tiny trailing chunks get folded into the previous

export interface PageText {
  page: number;
  text: string;
}

export interface Chunk {
  index: number;
  page: number | null;
  content: string;
}

export function chunkPages(pages: PageText[]): Chunk[] {
  const chunks: Chunk[] = [];
  let idx = 0;

  for (const { page, text } of pages) {
    const clean = normalize(text);
    if (!clean) continue;

    const paras = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

    let buf = "";
    for (const para of paras) {
      if (para.length > TARGET) {
        // Flush what we have, then split the oversize paragraph alone.
        if (buf) {
          chunks.push({ index: idx++, page, content: buf });
          buf = tailOverlap(buf);
        }
        for (const piece of splitLong(para)) {
          chunks.push({ index: idx++, page, content: (buf ? buf + " " : "") + piece });
          buf = tailOverlap(piece);
        }
        continue;
      }

      const proposed = buf ? buf + "\n\n" + para : para;
      if (proposed.length > TARGET) {
        chunks.push({ index: idx++, page, content: buf });
        buf = tailOverlap(buf) + (tailOverlap(buf) ? "\n\n" : "") + para;
      } else {
        buf = proposed;
      }
    }

    if (buf) {
      chunks.push({ index: idx++, page, content: buf });
    }
  }

  // Fold a stubby trailing chunk back into its predecessor.
  if (chunks.length >= 2) {
    const last = chunks[chunks.length - 1];
    if (last.content.length < MIN) {
      chunks[chunks.length - 2].content += "\n\n" + last.content;
      chunks.pop();
      // Re-number so indices stay contiguous.
      chunks.forEach((c, i) => (c.index = i));
    }
  }

  return chunks;
}

function normalize(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tailOverlap(s: string): string {
  if (!s) return "";
  if (s.length <= OVERLAP) return s;
  // Prefer to start the overlap at a sentence boundary so we don't
  // open mid-word.
  const slice = s.slice(-OVERLAP);
  const m = slice.match(/[.!?]\s+(.+)$/);
  return m ? m[1] : slice;
}

function splitLong(s: string): string[] {
  // Try sentence-by-sentence packing first.
  const sentences = s.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [s];
  const out: string[] = [];
  let buf = "";
  for (const sent of sentences) {
    if ((buf + sent).length > TARGET) {
      if (buf) out.push(buf.trim());
      if (sent.length > TARGET) {
        // Really long sentence (rare but possible in legal boilerplate) —
        // hard-split on character count.
        for (let i = 0; i < sent.length; i += TARGET - OVERLAP) {
          out.push(sent.slice(i, i + TARGET).trim());
        }
        buf = "";
      } else {
        buf = sent;
      }
    } else {
      buf += sent;
    }
  }
  if (buf) out.push(buf.trim());
  return out.filter(Boolean);
}

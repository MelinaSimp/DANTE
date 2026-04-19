// Reference-library retrieval for call summarization.
//
// The compliance + RMD + contribution-limit story falls apart if the
// model hallucinates numbers. This module looks at a transcript, picks
// out regulatory topics by keyword, and pulls the most relevant
// paragraphs from the reference_chunks table so the summarizer prompt
// has authoritative source text in front of it when it produces claims.
//
// Why keywords and not embeddings (yet):
// - The reference corpus is small (target ~10 docs). Keyword filtering
//   is accurate enough and latency-free.
// - jsonb embedding cosine is doable but pgvector is the right long-
//   term home; we'll swap when query volume justifies the migration.
// - The summarizer's own citations (cite_segments) are what we grade
//   the eval on. Reference context is a belt-and-suspenders input to
//   the model, not a new surface for hallucinations.
//
// Topic → source_key mapping mirrors scripts/reference-corpus.md. When
// a topic doesn't match anything in the ingested corpus we silently
// return [] — the summarizer still works, just without that belt.

import { supabaseAdmin } from "@/lib/supabase/admin";

export type ReferenceChunk = {
  source_key: string;
  source_title: string;
  chunk_index: number;
  content: string;
};

// Keyword matchers. Each entry maps a regex (case-insensitive,
// word-boundary) to one or more source_keys. The first match per
// topic wins; duplicate sources across topics are de-duped.
//
// Keep patterns narrow enough that a casual mention ("my Roth") doesn't
// trigger a flood. A topic must actually be discussed to retrieve.
const TOPIC_RULES: Array<{
  id: string;
  pattern: RegExp;
  sources: string[];
}> = [
  {
    id: "rmd",
    pattern: /\b(RMD|required minimum distribution|uniform lifetime)\b/i,
    sources: ["irs-pub-590b-2025"],
  },
  {
    id: "roth_conversion",
    pattern: /\broth conversion\b/i,
    sources: ["irs-pub-590a-2025", "irs-pub-590b-2025"],
  },
  {
    id: "contribution_limit",
    pattern:
      /\b(contribution limit|401\(?k\)?\s+limit|IRA\s+limit|catch[- ]up)\b/i,
    sources: [
      "irs-rev-proc-contribution-limits-2025",
      "irs-pub-590a-2025",
    ],
  },
  {
    id: "pension_distribution",
    pattern:
      /\b(pension|annuity|1099[- ]R|early withdrawal|distribution code)\b/i,
    sources: ["irs-pub-575-2025"],
  },
  {
    id: "capital_gains",
    pattern:
      /\b(capital gain|capital loss|wash sale|tax loss harvest|cost basis)\b/i,
    sources: ["irs-pub-550-2025"],
  },
  {
    id: "social_security",
    pattern: /\b(social security|COLA|full retirement age|SSA)\b/i,
    sources: ["ssa-cola-2025"],
  },
  {
    id: "medicare",
    pattern: /\b(IRMAA|medicare part b|medicare premium)\b/i,
    sources: ["cms-irmaa-2025"],
  },
  {
    id: "finra_communication",
    pattern: /\b(guarantee|promise|risk[- ]free|never goes down)\b/i,
    sources: ["finra-2210"],
  },
  {
    id: "reg_bi",
    pattern: /\b(best interest|suitability|fiduciary)\b/i,
    sources: ["sec-reg-bi", "sec-adv-part-2a"],
  },
];

export type RetrievalOptions = {
  workspaceId?: string | null; // currently unused; all ref docs are shared
  maxChunksPerSource?: number;
  maxTotalChunks?: number;
};

// Score a chunk against an array of keyword hits from the transcript.
// We use simple token-overlap — count how many of the original match
// strings appear in the chunk content. The chunks with the highest
// overlap get picked.
function scoreChunk(chunk: string, triggers: string[]): number {
  const lc = chunk.toLowerCase();
  let score = 0;
  for (const t of triggers) {
    if (!t) continue;
    if (lc.includes(t.toLowerCase())) score += 1;
  }
  return score;
}

export async function retrieveReferences(
  transcript: string,
  opts: RetrievalOptions = {}
): Promise<ReferenceChunk[]> {
  if (!transcript || transcript.trim().length < 20) return [];

  const maxPer = opts.maxChunksPerSource ?? 2;
  const maxTotal = opts.maxTotalChunks ?? 4;

  // 1) Find matching topics and collect trigger words.
  const hitSources = new Map<string, Set<string>>(); // source_key -> trigger strings
  for (const rule of TOPIC_RULES) {
    const m = transcript.match(rule.pattern);
    if (!m) continue;
    for (const src of rule.sources) {
      const bag = hitSources.get(src) || new Set<string>();
      bag.add(m[0]);
      hitSources.set(src, bag);
    }
  }
  if (hitSources.size === 0) return [];

  // 2) Load sources we matched. If none of them are ingested, bail.
  const sourceKeys = Array.from(hitSources.keys());
  const { data: sources } = await supabaseAdmin
    .from("reference_sources")
    .select("id, source_key, title")
    .in("source_key", sourceKeys);
  if (!sources || sources.length === 0) return [];

  const titleBySource = new Map<string, string>();
  const idBySource = new Map<string, string>();
  for (const s of sources as any[]) {
    titleBySource.set(s.source_key, s.title);
    idBySource.set(s.source_key, s.id);
  }

  // 3) For each source, pull its chunks and pick the top-N by keyword
  //    overlap. We cap per-source and overall so the prompt doesn't
  //    balloon.
  const picked: ReferenceChunk[] = [];
  for (const [srcKey, triggerSet] of hitSources.entries()) {
    const srcId = idBySource.get(srcKey);
    if (!srcId) continue;
    const { data: chunks } = await supabaseAdmin
      .from("reference_chunks")
      .select("chunk_index, content")
      .eq("source_id", srcId)
      .order("chunk_index", { ascending: true })
      .limit(200);
    if (!chunks || chunks.length === 0) continue;

    const triggers = Array.from(triggerSet);
    const scored = (chunks as any[])
      .map((c) => ({
        chunk_index: c.chunk_index as number,
        content: String(c.content || ""),
        score: scoreChunk(String(c.content || ""), triggers),
      }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPer);

    for (const c of scored) {
      picked.push({
        source_key: srcKey,
        source_title: titleBySource.get(srcKey) || srcKey,
        chunk_index: c.chunk_index,
        content: c.content,
      });
      if (picked.length >= maxTotal) break;
    }
    if (picked.length >= maxTotal) break;
  }

  return picked;
}

// Format retrieved chunks into a prompt block. Kept as a pure function
// so the summarizer stays storage-agnostic.
export function formatReferenceContext(chunks: ReferenceChunk[]): string {
  if (chunks.length === 0) return "";
  const lines: string[] = [
    "REFERENCE CONTEXT (authoritative sources — use to avoid factual errors, do NOT cite as transcript segments):",
    "",
  ];
  for (const c of chunks) {
    lines.push(
      `— [${c.source_key} · chunk ${c.chunk_index}] ${c.source_title}`
    );
    lines.push(c.content.slice(0, 1200));
    lines.push("");
  }
  return lines.join("\n");
}

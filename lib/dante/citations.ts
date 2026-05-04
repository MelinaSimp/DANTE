// lib/dante/citations.ts
//
// Citation parsing helpers for the chat surface. The agent emits
// three kinds of inline markers in its output:
//
//   [v1], [v2], ...           — vault.cite citations. The matching
//                                source row lives in the trace under
//                                the most recent vault.cite tool_end
//                                event's output.citations[].
//
//   [mem:abc12345]            — memory.search citations, where the
//                                hex chunk is the first 8 chars of a
//                                dante_memory.id. We resolve these by
//                                scanning trace memory.search outputs.
//
//   [reg:1], [reg:2], ...     — regulatory.search citations from the
//                                workspace-shared corpus (SEC, IRS,
//                                DOL, HUD, FINRA). Resolved by walking
//                                trace regulatory_search outputs in
//                                document order — same positional
//                                lookup the formatRegulatoryHitsForPrompt
//                                helper uses to assign [reg:N].
//
// We do all resolution client-side from the trace, no extra fetch.
// The trace already carries everything needed because the agent
// loop persists tool outputs verbatim.

export interface CitationMap {
  vault: Record<string, VaultCitation>;            // "v1" → details
  memory: Record<string, MemoryCitation>;          // "mem:abc12345" → details
  regulatory: Record<string, RegulatoryCitation>;  // "reg:1" → details
}

export interface VaultCitation {
  marker: string;          // "[v1]"
  quote: string;
  source: string;          // document title
  page?: number | null;
  document_id?: string;
}

export interface MemoryCitation {
  id: string;              // full uuid
  short_id: string;        // first 8 chars
  kind: string;            // "fact" | "summary" | "episode"
  content: string;
  source_kind?: string | null;
  source_id?: string | null;
}

export interface RegulatoryCitation {
  marker: string;          // "[reg:1]"
  index: number;           // 1-based position in the agent's hit list
  authority: string;       // "SEC" | "IRS" | "DOL" | "HUD" | etc.
  source_kind: string;     // "press_release" | "rev_ruling" | etc.
  source_url: string;      // canonical link to the primary source
  title: string;
  content: string;         // the chunk content used for grounding
  published_at: string | null;
}

interface TraceEntry {
  step_id: string;
  step_name: string;
  status: string;
  output?: unknown;
}

/**
 * Walk the trace and build a citation lookup. Later vault.cite calls
 * win on conflicting markers (chronologically the model is using the
 * most recent set), but in practice the model emits citations from
 * one tool call per response so collisions are rare.
 */
export function buildCitationMap(trace: TraceEntry[] | undefined): CitationMap {
  const out: CitationMap = { vault: {}, memory: {}, regulatory: {} };
  if (!Array.isArray(trace)) return out;

  for (const entry of trace) {
    const result = (entry.output as { result?: unknown })?.result;
    if (!result || typeof result !== "object") continue;

    // vault.cite returns { citations: [{ marker: "[v1]", quote, source, page, document_id }] }
    const vaultCitations = (result as { citations?: unknown[] }).citations;
    if (
      Array.isArray(vaultCitations) &&
      entry.step_name.includes("vault_cite")
    ) {
      for (const c of vaultCitations as Array<{
        marker?: string;
        quote?: string;
        source?: string;
        page?: number | null;
        document_id?: string;
      }>) {
        if (!c.marker) continue;
        // Strip brackets so the lookup key matches what we extract from text.
        const key = c.marker.replace(/[[\]]/g, "");
        out.vault[key] = {
          marker: c.marker,
          quote: c.quote || "",
          source: c.source || "(untitled)",
          page: c.page ?? null,
          document_id: c.document_id,
        };
      }
    }

    // memory.search returns { hits: [{ id, kind, content, source_kind, source_id }], formatted }
    const memHits = (result as { hits?: unknown[] }).hits;
    if (Array.isArray(memHits) && entry.step_name.includes("memory_search")) {
      for (const h of memHits as Array<{
        id?: string;
        kind?: string;
        content?: string;
        source_kind?: string | null;
        source_id?: string | null;
      }>) {
        if (!h.id) continue;
        const shortId = h.id.slice(0, 8);
        out.memory[`mem:${shortId}`] = {
          id: h.id,
          short_id: shortId,
          kind: h.kind || "fact",
          content: h.content || "",
          source_kind: h.source_kind ?? null,
          source_id: h.source_id ?? null,
        };
      }
    }

    // regulatory.search returns { hits: [...], formatted }. The
    // formatter assigns [reg:N] in 1-based document order; we
    // reproduce that ordering here so the tokenizer's "reg:1" key
    // resolves to the first hit, "reg:2" to the second, etc. The
    // most recent regulatory_search call wins on key collisions
    // (model usually emits citations from one call per response).
    const regHits = (result as { hits?: unknown[] }).hits;
    if (Array.isArray(regHits) && entry.step_name.includes("regulatory_search")) {
      let i = 1;
      for (const h of regHits as Array<{
        item_id?: string;
        chunk_id?: string;
        authority?: string;
        source_kind?: string;
        source_url?: string;
        title?: string;
        content?: string;
        published_at?: string | null;
      }>) {
        if (!h.source_url) continue;
        const key = `reg:${i}`;
        out.regulatory[key] = {
          marker: `[${key}]`,
          index: i,
          authority: h.authority || "OTHER",
          source_kind: h.source_kind || "guidance",
          source_url: h.source_url,
          title: h.title || "(untitled)",
          content: h.content || "",
          published_at: h.published_at ?? null,
        };
        i += 1;
      }
    }
  }
  return out;
}

/**
 * Tokenize text into a flat array of "text" runs and "citation"
 * tokens so the renderer can wrap citations in interactive chips
 * without fighting React keys.
 *
 * Markers we recognize:
 *   [v\d+]          → vault citation
 *   [mem:[0-9a-f]+] → memory citation
 *   [reg:\d+]       → regulatory corpus citation (SEC/IRS/DOL/HUD)
 *
 * Everything else is opaque text.
 */
export type Token =
  | { kind: "text"; value: string }
  | {
      kind: "citation";
      raw: string;
      key: string;
      type: "vault" | "memory" | "regulatory";
    };

const CITATION_RE = /\[(v\d+|mem:[0-9a-f]{4,32}|reg:\d+)\]/g;

export function tokenize(input: string): Token[] {
  if (!input) return [{ kind: "text", value: "" }];
  const out: Token[] = [];
  let lastIndex = 0;
  for (const match of input.matchAll(CITATION_RE)) {
    const start = match.index!;
    if (start > lastIndex) {
      out.push({ kind: "text", value: input.slice(lastIndex, start) });
    }
    const key = match[1];
    const type: "vault" | "memory" | "regulatory" = key.startsWith("mem:")
      ? "memory"
      : key.startsWith("reg:")
        ? "regulatory"
        : "vault";
    out.push({ kind: "citation", raw: match[0], key, type });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < input.length) {
    out.push({ kind: "text", value: input.slice(lastIndex) });
  }
  return out;
}

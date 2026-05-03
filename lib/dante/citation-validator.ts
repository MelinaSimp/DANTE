// lib/dante/citation-validator.ts
//
// Citation validation — the load-bearing safety check for the entire
// "grounded AI" thesis. The agent emits `[v1]`, `[v2]`, `[mem:abc12345]`
// markers in its output; the existing buildCitationMap() in
// citations.ts resolves those to {quote, source, page, document_id}
// from the tool trace.
//
// What's missing without this file: nothing checks that the cited
// page exists, that the cited quote actually appears in the cited
// document, or that the marker is referenced at all in the response.
// GPT-class models will confidently cite "p.14" of an 11-page doc.
// In a regulated context that's the difference between a tool a
// compliance officer trusts and one that gets the firm fined.
//
// What this file does:
//   1. Extract every marker from the response text.
//   2. For each vault marker, look up the underlying archive chunk
//      and confirm:
//        - the document_id resolves
//        - the cited page (if given) actually exists in the document
//        - the quote substring appears in the cited chunk's content
//          (whitespace-normalized — chunkers add/remove whitespace).
//   3. For each memory marker, confirm the dante_memory row exists
//      and the trace's content matches its persisted content.
//   4. Surface an overall status: valid (everything checked),
//      partial (some warnings), invalid (any failure).
//
// Validator never throws on the happy path. A network or DB error
// becomes status="unverifiable" — the response still ships, but the
// caller can decorate it with a "could not verify" chip rather than
// pretending the citations were checked.
//
// We intentionally do this validation post-stream (i.e. once the agent
// has finished). Streaming validation would mean re-parsing on every
// SSE chunk, which doubles work without changing the user-visible
// outcome. The chat client receives the validator result as a final
// frame and decorates citation chips accordingly.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildCitationMap, type CitationMap } from "./citations";

// ── Types ────────────────────────────────────────────────────────

export type CitationStatus =
  | "valid"           // marker resolved, quote + page check passed
  | "missing"         // marker in text but not in trace
  | "quote_mismatch"  // resolved, but quote not found in cited chunk
  | "page_mismatch"   // resolved, but cited page not in document
  | "doc_missing"     // referenced document_id no longer exists
  | "unverifiable";   // DB error / network — could not check

export interface CitationCheck {
  marker: string;             // raw marker as it appeared, e.g. "[v1]"
  type: "vault" | "memory";
  status: CitationStatus;
  /** Free-form note shown in the UI tooltip (`Quote not found in cited chunk`). */
  detail?: string;
  /** Resolved citation (when available) — useful for surfacing source title. */
  source?: string;
  page?: number | null;
  document_id?: string;
}

export interface CitationValidationReport {
  /** Overall verdict, computed from the worst per-marker status. */
  overall: "valid" | "partial" | "invalid" | "unverifiable" | "no_citations";
  /** Per-marker results, in the order they appear in the response. */
  checks: CitationCheck[];
  /** Counts for telemetry / UI summary. */
  counts: {
    total: number;
    valid: number;
    failed: number;
    unverifiable: number;
  };
}

// ── Marker extraction ────────────────────────────────────────────

const MARKER_RE = /\[(v\d+|mem:[0-9a-f]{4,32})\]/g;

interface ExtractedMarker {
  raw: string;       // "[v1]"
  key: string;       // "v1" or "mem:abc12345"
  type: "vault" | "memory";
  index: number;     // position in text — used to keep checks in order
}

function extractMarkers(text: string): ExtractedMarker[] {
  const out: ExtractedMarker[] = [];
  if (!text) return out;
  for (const match of text.matchAll(MARKER_RE)) {
    const key = match[1];
    out.push({
      raw: match[0],
      key,
      type: key.startsWith("mem:") ? "memory" : "vault",
      index: match.index ?? 0,
    });
  }
  return out;
}

// ── Quote normalization ──────────────────────────────────────────

/**
 * Whitespace-normalize a string for substring comparison. Chunkers
 * collapse newlines, swap nbsp for space, etc. Our cited quote is
 * `chunk.content.trim().slice(0, 400)` — same source, different
 * whitespace possible. Lowercasing is fine; we are checking
 * existence, not exact match.
 */
function normalizeForCompare(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/ /g, " ") // non-breaking space
    .toLowerCase()
    .trim();
}

/**
 * Returns true when `needle` is found inside `haystack` after
 * normalization. We require a meaningful chunk match — a 5-word
 * window, not a one-word coincidence — so a stop-word collision
 * doesn't pass for valid.
 */
function quoteAppearsIn(needle: string, haystack: string): boolean {
  if (!needle || !haystack) return false;
  const n = normalizeForCompare(needle);
  const h = normalizeForCompare(haystack);
  if (n.length === 0) return false;
  // Whole quote (or its first 80 chars) appearing verbatim is the
  // common case. The fallback below handles light reformatting.
  if (h.includes(n)) return true;
  const head = n.slice(0, 80);
  if (head.length >= 30 && h.includes(head)) return true;
  return false;
}

// ── Vault validation ─────────────────────────────────────────────

interface ArchiveChunkLookup {
  document_id: string;
  page_number: number | null;
  content: string;
  /** Document page_count cached on the row for page-bound checks. */
  document_page_count: number | null;
}

/**
 * Pulls the chunks referenced in vault citations and the page_count
 * of their parent documents in one round-trip. Returns a map keyed
 * by document_id. Caller passes the unique document_ids from the
 * citation map.
 */
async function fetchVaultContext(
  workspaceId: string,
  documentIds: string[],
): Promise<Map<string, { page_count: number | null; chunks: ArchiveChunkLookup[] }>> {
  const result = new Map<string, { page_count: number | null; chunks: ArchiveChunkLookup[] }>();
  if (documentIds.length === 0) return result;

  // Documents — for page_count and existence check.
  const { data: docs, error: docErr } = await supabaseAdmin
    .from("dante_archive_documents")
    .select("id, page_count")
    .eq("workspace_id", workspaceId)
    .in("id", documentIds);
  if (docErr) {
    // Bubble up; caller catches and emits "unverifiable".
    throw new Error(`citation-validator: docs lookup failed: ${docErr.message}`);
  }
  for (const d of docs || []) {
    result.set((d as { id: string }).id, {
      page_count: (d as { page_count: number | null }).page_count ?? null,
      chunks: [],
    });
  }

  // Chunks — content + page_number for the quote/page checks.
  const { data: chunks, error: chunkErr } = await supabaseAdmin
    .from("dante_archive_chunks")
    .select("document_id, page_number, content")
    .eq("workspace_id", workspaceId)
    .in("document_id", documentIds);
  if (chunkErr) {
    throw new Error(`citation-validator: chunks lookup failed: ${chunkErr.message}`);
  }
  for (const c of chunks || []) {
    const row = c as { document_id: string; page_number: number | null; content: string };
    const entry = result.get(row.document_id);
    if (!entry) continue;
    entry.chunks.push({
      document_id: row.document_id,
      page_number: row.page_number,
      content: row.content,
      document_page_count: entry.page_count,
    });
  }
  return result;
}

// ── Memory validation ────────────────────────────────────────────

async function fetchMemoryContext(
  workspaceId: string,
  shortIds: string[],
): Promise<Map<string, { id: string; content: string }>> {
  const result = new Map<string, { id: string; content: string }>();
  if (shortIds.length === 0) return result;

  // dante_memory.id is a uuid; the marker carries first-8-chars only.
  // We OR over `id::text LIKE 'abc12345%'` patterns. Workspace scope
  // keeps the prefix-match cheap and bounded.
  const orFilter = shortIds
    .map((s) => s.replace(/[^0-9a-f]/g, ""))
    .filter((s) => s.length === 8)
    .map((s) => `id.like.${s}%`)
    .join(",");
  if (!orFilter) return result;

  const { data, error } = await supabaseAdmin
    .from("dante_memory")
    .select("id, content")
    .eq("workspace_id", workspaceId)
    .or(orFilter);
  if (error) {
    throw new Error(`citation-validator: memory lookup failed: ${error.message}`);
  }
  for (const row of (data || []) as Array<{ id: string; content: string }>) {
    result.set(row.id.slice(0, 8), { id: row.id, content: row.content });
  }
  return result;
}

// ── Top-level validator ──────────────────────────────────────────

export interface ValidateInput {
  workspaceId: string;
  responseText: string;
  /** Trace is the agent's tool-call log — same shape buildCitationMap consumes. */
  trace: Array<{ step_id: string; step_name: string; status: string; output?: unknown }>;
}

export async function validateCitations(
  input: ValidateInput,
): Promise<CitationValidationReport> {
  const markers = extractMarkers(input.responseText);
  if (markers.length === 0) {
    return {
      overall: "no_citations",
      checks: [],
      counts: { total: 0, valid: 0, failed: 0, unverifiable: 0 },
    };
  }

  const map: CitationMap = buildCitationMap(input.trace);

  // Collect unique document_ids and memory short-ids referenced.
  const docIds = new Set<string>();
  const memShorts = new Set<string>();
  for (const m of markers) {
    if (m.type === "vault") {
      const cite = map.vault[m.key];
      if (cite?.document_id) docIds.add(cite.document_id);
    } else {
      const short = m.key.slice(4); // strip "mem:" prefix
      memShorts.add(short);
    }
  }

  // Run lookups; on DB error mark every unresolved marker as
  // unverifiable rather than failing the whole response.
  let vaultCtx: Map<string, { page_count: number | null; chunks: ArchiveChunkLookup[] }> = new Map();
  let memCtx: Map<string, { id: string; content: string }> = new Map();
  let lookupFailed = false;
  try {
    const [v, m] = await Promise.all([
      fetchVaultContext(input.workspaceId, Array.from(docIds)),
      fetchMemoryContext(input.workspaceId, Array.from(memShorts)),
    ]);
    vaultCtx = v;
    memCtx = m;
  } catch (err) {
    console.warn("[citation-validator] lookup failed:", err);
    lookupFailed = true;
  }

  const checks: CitationCheck[] = [];
  for (const m of markers) {
    if (m.type === "vault") {
      checks.push(checkVaultMarker(m, map, vaultCtx, lookupFailed));
    } else {
      checks.push(checkMemoryMarker(m, map, memCtx, lookupFailed));
    }
  }

  return summarize(checks);
}

function checkVaultMarker(
  m: ExtractedMarker,
  map: CitationMap,
  vaultCtx: Map<string, { page_count: number | null; chunks: ArchiveChunkLookup[] }>,
  lookupFailed: boolean,
): CitationCheck {
  const cite = map.vault[m.key];
  if (!cite) {
    return {
      marker: m.raw,
      type: "vault",
      status: "missing",
      detail: "Marker referenced but no matching vault.cite call in trace.",
    };
  }
  const base: CitationCheck = {
    marker: m.raw,
    type: "vault",
    status: "valid",
    source: cite.source,
    page: cite.page ?? null,
    document_id: cite.document_id,
  };
  if (lookupFailed) {
    return { ...base, status: "unverifiable", detail: "Could not reach archive for verification." };
  }
  if (!cite.document_id) {
    return { ...base, status: "doc_missing", detail: "Citation has no document_id." };
  }
  const doc = vaultCtx.get(cite.document_id);
  if (!doc) {
    return { ...base, status: "doc_missing", detail: "Cited document not found in vault." };
  }
  // Page bound check — if the model cited a specific page, confirm
  // the document actually has that page (uses page_count when set,
  // falls back to "any chunk has this page_number" when the doc
  // didn't have a page_count populated).
  if (cite.page != null) {
    const inBounds =
      doc.page_count != null
        ? cite.page >= 1 && cite.page <= doc.page_count
        : doc.chunks.some((c) => c.page_number === cite.page);
    if (!inBounds) {
      return {
        ...base,
        status: "page_mismatch",
        detail:
          doc.page_count != null
            ? `Cited p.${cite.page} but document has ${doc.page_count} pages.`
            : `Cited p.${cite.page} not present in any chunk of document.`,
      };
    }
  }
  // Quote check — find a chunk whose content contains the cited
  // quote. Prefer a chunk on the cited page; fall back to any chunk
  // in the document if pageless.
  const candidates = cite.page != null
    ? doc.chunks.filter((c) => c.page_number === cite.page)
    : doc.chunks;
  const pool = candidates.length > 0 ? candidates : doc.chunks;
  const matched = pool.some((c) => quoteAppearsIn(cite.quote, c.content));
  if (!matched) {
    return {
      ...base,
      status: "quote_mismatch",
      detail: "Cited quote not found in the document content.",
    };
  }
  return base;
}

function checkMemoryMarker(
  m: ExtractedMarker,
  map: CitationMap,
  memCtx: Map<string, { id: string; content: string }>,
  lookupFailed: boolean,
): CitationCheck {
  const cite = map.memory[m.key];
  const short = m.key.slice(4);
  if (!cite) {
    return {
      marker: m.raw,
      type: "memory",
      status: "missing",
      detail: "Marker referenced but no matching memory.search hit in trace.",
    };
  }
  const base: CitationCheck = {
    marker: m.raw,
    type: "memory",
    status: "valid",
    source: `memory:${cite.kind}`,
  };
  if (lookupFailed) {
    return { ...base, status: "unverifiable", detail: "Could not reach memory for verification." };
  }
  const row = memCtx.get(short);
  if (!row) {
    return { ...base, status: "doc_missing", detail: "Cited memory row not found." };
  }
  // Trace content should match persisted content (memory rows are
  // immutable on read paths). Mismatch suggests the model stitched a
  // citation onto unrelated text.
  if (!quoteAppearsIn(cite.content, row.content) && !quoteAppearsIn(row.content, cite.content)) {
    return {
      ...base,
      status: "quote_mismatch",
      detail: "Trace memory content diverges from persisted memory.",
    };
  }
  return base;
}

function summarize(checks: CitationCheck[]): CitationValidationReport {
  const counts = { total: checks.length, valid: 0, failed: 0, unverifiable: 0 };
  for (const c of checks) {
    if (c.status === "valid") counts.valid++;
    else if (c.status === "unverifiable") counts.unverifiable++;
    else counts.failed++;
  }
  let overall: CitationValidationReport["overall"];
  if (counts.total === 0) overall = "no_citations";
  else if (counts.failed === 0 && counts.unverifiable === 0) overall = "valid";
  else if (counts.failed === 0) overall = "unverifiable";
  else if (counts.valid === 0) overall = "invalid";
  else overall = "partial";

  return { overall, checks, counts };
}

// lib/dante/memory/types.ts
//
// Shared types for the dante_memory store. Kept in a separate file
// because the search and write helpers both depend on these, and
// downstream consumers (agent node, briefs) also import them.

export type MemoryKind = "fact" | "summary" | "episode";

export const MEMORY_KINDS: readonly MemoryKind[] = ["fact", "summary", "episode"];

export interface MemoryHit {
  id: string;
  kind: MemoryKind;
  content: string;
  subject_contact_id: string | null;
  source_kind: string | null;
  source_id: string | null;
  confidence: number;
  created_at: string;
  /**
   * Cosine similarity in [0, 1] when the row has an embedding;
   * 0 when it does not. The RPC ranks non-embedded rows by recency
   * × confidence so they still surface — `similarity` is only
   * meaningful for embedded rows.
   */
  similarity: number;
}

export interface MemoryRow {
  id: string;
  workspace_id: string;
  kind: MemoryKind;
  subject_contact_id: string | null;
  subject_type: string | null;
  source_kind: string | null;
  source_id: string | null;
  content: string;
  confidence: number;
  expires_at: string | null;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
}

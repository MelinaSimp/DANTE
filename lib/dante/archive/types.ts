// lib/dante/archive/types.ts
//
// Shared types for the Dante Archive (Harvey Vault analog). Kept
// free of React / Supabase imports so it can be consumed by both
// server helpers and client components.

export type ArchiveKind =
  | "form_adv"          // SEC Form ADV filings
  | "ips"               // Investment Policy Statement
  | "prospectus"        // fund prospectus / offering docs
  | "client_agreement"  // advisory / engagement letters
  | "policy"            // internal firm policy / SOP
  | "regulation"        // FINRA / SEC / state rulebook excerpts
  | "memo"              // compliance / research memos
  | "other";

export const ARCHIVE_KIND_LABELS: Record<ArchiveKind, string> = {
  form_adv: "Form ADV",
  ips: "IPS",
  prospectus: "Prospectus",
  client_agreement: "Client agreement",
  policy: "Policy / SOP",
  regulation: "Regulation",
  memo: "Memo",
  other: "Other",
};

export type ArchiveStatus = "processing" | "ready" | "error";

export interface ArchiveDocumentRow {
  id: string;
  workspace_id: string;
  title: string;
  kind: ArchiveKind | null;
  tags: string[];
  storage_path: string;
  mime_type: string | null;
  byte_size: number | null;
  page_count: number | null;
  source_url: string | null;
  status: ArchiveStatus;
  error: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArchiveChunkRow {
  id: string;
  document_id: string;
  workspace_id: string;
  chunk_index: number;
  page_number: number | null;
  content: string;
  created_at: string;
}

export interface ArchiveSearchHit {
  chunk_id: string;
  document_id: string;
  chunk_index: number;
  page_number: number | null;
  content: string;
  similarity: number;
  document_title: string;
  document_kind: ArchiveKind | null;
}

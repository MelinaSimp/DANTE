-- Document extractions — structured data pulled out of client PDFs.
--
-- The `documents` table (added 2024-01) stores the PDF and its raw
-- extracted text. This table stores the *interpreted* form — the
-- parsed 1099-B transactions, the W-2 wage boxes, the K-1 pass-
-- through income. One row per (document, doc_type, model) tuple so
-- re-running with a newer model doesn't destroy the old extraction.
--
-- Schema:
--   doc_type: 'form_1099_b' | 'form_1099_div' | 'form_1099_r' |
--             'form_w2' | 'form_k1' | 'form_5498' | 'other'
--
--   fields: flat scalars (payer name, recipient TIN, tax year, etc).
--           Shape varies per doc_type; see lib/documents/schemas.ts.
--
--   rows: repeated structured data — 1099-B transaction lines, W-2
--         box-by-box values, K-1 distributions. Array of objects.
--
--   confidence: 0..1 overall, plus per-field confidence in
--               confidence_detail. The UI shows a warn chip when
--               overall < 0.85 so reviewers look at it.
--
--   verified_by / verified_at: advisor confirmation. After they
--               eyeball the 1099-B against the PDF and click
--               "looks right", this row becomes authoritative and
--               downstream (tax projections, cost-basis reconciliation
--               with the custodian layer) can rely on it.

create table if not exists document_extractions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  doc_type text not null,
  model text not null,         -- e.g. 'claude-sonnet-4-5', 'gpt-4o'
  prompt_version text not null default 'v1',
  tax_year int,                -- denormalized for fast filter
  fields jsonb not null default '{}'::jsonb,
  rows jsonb not null default '[]'::jsonb,
  confidence numeric(4, 3),
  confidence_detail jsonb,     -- { field_name: 0..1 } per-field
  verified_by uuid references profiles(id),
  verified_at timestamptz,
  verification_note text,
  created_at timestamptz default now(),
  unique (document_id, doc_type, model, prompt_version)
);

create index if not exists idx_document_extractions_workspace
  on document_extractions (workspace_id);
create index if not exists idx_document_extractions_document
  on document_extractions (document_id);
create index if not exists idx_document_extractions_doc_type_year
  on document_extractions (doc_type, tax_year);

alter table document_extractions enable row level security;

create policy "Workspace members read document_extractions"
  on document_extractions for select to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));

create policy "Workspace members write document_extractions"
  on document_extractions for insert to authenticated
  with check (workspace_id in (select workspace_id from profiles where id = auth.uid()));

create policy "Workspace members update document_extractions"
  on document_extractions for update to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));

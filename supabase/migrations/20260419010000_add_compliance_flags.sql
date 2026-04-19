-- Compliance flags — outputs of the compliance scanner.
--
-- When the scanner runs over a piece of advisor-to-client communication
-- (a note, an email draft, an SMS, a call summary), it produces zero or
-- more flag rows here. Flags come from two layers:
--
--   1. Deterministic rules — regex / keyword patterns grounded in
--      FINRA 2210, SEC Reg BI, and firm-specific prohibitions. These
--      are cheap, reliable, and explainable.
--   2. LLM analysis — fuzzier checks for things rules can't catch
--      (implied guarantees, suitability gaps, scope creep beyond the
--      engagement agreement). The LLM cites the reference_chunks row
--      it used to justify the flag.
--
-- The status column gates whether a piece of content is blocked from
-- send. The FINRA-regulated workflow is:
--
--   pending   → scanner found something; a principal must review
--   approved  → reviewer marked OK; content can go out
--   dismissed → flag was a false positive; don't raise again for the
--               same (source_type, source_id, rule_id) tuple
--
-- source_type + source_id together point at the scanned content.
-- We don't use a foreign key because source tables vary (notes,
-- outbound_emails, call_recordings, …) — compliance cuts across.

create table if not exists compliance_flags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,

  -- What was scanned
  source_type text not null,            -- 'note' | 'email' | 'sms' | 'call_summary' | 'draft'
  source_id text not null,              -- row id in the source table (text so we can key by uuid or int)
  scanned_text text not null,           -- the exact bytes that triggered — so reviewers see what the scanner saw

  -- What was found
  layer text not null,                  -- 'rule' | 'llm'
  rule_id text,                         -- e.g. 'finra-2210-guarantees', 'reg-bi-suitability-age-risk'
  severity text not null default 'warn',-- 'info' | 'warn' | 'block'
  message text not null,                -- human-readable explanation of why this fired
  citation_refs jsonb,                  -- references into reference_chunks: [{ source_key, chunk_index, quote }]

  -- Review workflow
  status text not null default 'pending', -- 'pending' | 'approved' | 'dismissed'
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  review_note text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_compliance_flags_workspace_status
  on compliance_flags (workspace_id, status);

create index if not exists idx_compliance_flags_source
  on compliance_flags (source_type, source_id);

alter table compliance_flags enable row level security;

-- Only members of the workspace can read or write flags for that workspace.
create policy "Workspace members read compliance flags"
  on compliance_flags for select
  to authenticated
  using (
    workspace_id in (
      select workspace_id from profiles where id = auth.uid()
    )
  );

create policy "Workspace members write compliance flags"
  on compliance_flags for insert
  to authenticated
  with check (
    workspace_id in (
      select workspace_id from profiles where id = auth.uid()
    )
  );

create policy "Workspace members update compliance flags"
  on compliance_flags for update
  to authenticated
  using (
    workspace_id in (
      select workspace_id from profiles where id = auth.uid()
    )
  );

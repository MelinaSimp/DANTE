-- Phase 3 — Compliance v2 surfaces.
--
-- Adds four CCO-facing surfaces that reuse the existing
-- compliance_flags scanner where possible and add their own
-- structured tables where the workflow is distinct:
--
--   marketing_reviews     — queue of marketing/campaign content
--                           submitted for CCO sign-off before
--                           it goes out (FINRA 2210 retention rule).
--   adv_drafts            — Form ADV Part 2A drafts the firm is
--                           working on, with LLM-assisted section
--                           generation grounded in workspace facts.
--   oba_records           — Outside Business Activities disclosed
--                           by advisors. Annual attestation cycle.
--   advertising_reviews   — testimonials, case studies, social
--                           posts (rule 206(4)-1 marketing rule).
--                           Advisor submits, CCO approves/rejects.
--
-- All four are workspace-scoped with RLS. The existing
-- compliance_flags table stays as-is — the scanner output for
-- emails/notes/SMS keeps flowing there. These new tables are
-- about *content* awaiting review, not *findings* about content.

-- ── Marketing reviews ────────────────────────────────────────
create table if not exists compliance_marketing_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  submitted_by uuid references profiles(id),
  channel text not null,                -- 'email_campaign' | 'social_post' | 'blog' | 'newsletter' | 'webinar' | 'other'
  title text not null,
  body text not null,                   -- the actual marketing copy
  intended_audience text,               -- 'retail' | 'institutional' | 'mixed' (FINRA 2210 categories)
  intended_send_at timestamptz,         -- when the advisor wants to publish
  scan_result jsonb,                    -- output of scanForCompliance() at submission time
  scan_severity text,                   -- 'info' | 'warn' | 'block' — highest severity in scan_result
  status text not null default 'pending',  -- 'pending' | 'approved' | 'rejected' | 'changes_requested'
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  review_note text,
  approved_for_use_until date,          -- FINRA's approved-marketing-piece retention window
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_reviews_workspace_status
  on compliance_marketing_reviews (workspace_id, status);

alter table compliance_marketing_reviews enable row level security;

create policy "Workspace members read marketing reviews"
  on compliance_marketing_reviews for select to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members insert marketing reviews"
  on compliance_marketing_reviews for insert to authenticated
  with check (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members update marketing reviews"
  on compliance_marketing_reviews for update to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));

-- ── ADV drafts ────────────────────────────────────────────────
-- Form ADV Part 2A is the brochure every RIA delivers to clients.
-- Items 1-19 are required sections with prescribed content. The
-- assistant drafts each section based on workspace facts (firm
-- name, AUM, services, fees) plus the SEC's published instructions.
create table if not exists compliance_adv_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  created_by uuid references profiles(id),
  title text not null default 'Form ADV Part 2A',
  effective_date date,
  status text not null default 'draft',  -- 'draft' | 'reviewed' | 'filed' | 'archived'
  sections jsonb not null default '{}'::jsonb,  -- { item_1: { title, content, last_edited_at }, ... item_19: ... }
  filed_at timestamptz,                  -- IARD filing timestamp
  filed_by uuid references profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_adv_drafts_workspace
  on compliance_adv_drafts (workspace_id, status);

alter table compliance_adv_drafts enable row level security;

create policy "Workspace members read adv drafts"
  on compliance_adv_drafts for select to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members insert adv drafts"
  on compliance_adv_drafts for insert to authenticated
  with check (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members update adv drafts"
  on compliance_adv_drafts for update to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));

-- ── OBA — Outside Business Activities ─────────────────────────
-- FINRA Rule 3270 requires disclosure of any non-firm business
-- activity. Most RIA CCOs collect annual attestations. We give
-- them a structured roster + reminder cycle.
create table if not exists compliance_oba_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  advisor_id uuid references profiles(id),  -- the advisor whose OBA this is (may be self-disclosed)
  advisor_name text not null,              -- denormalized for display when advisor_id is null (legacy)
  activity_name text not null,
  activity_type text,                      -- 'board_seat' | 'consulting' | 'rental_property' | 'speaking' | 'family_business' | 'other'
  description text,
  is_compensated boolean default false,
  estimated_hours_per_month integer,
  start_date date,
  end_date date,
  is_disclosed_to_clients boolean default false,
  disclosure_status text default 'active', -- 'active' | 'inactive' | 'pending_review'
  last_attested_at timestamptz,
  next_attestation_due date,               -- usually annually
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_oba_records_workspace
  on compliance_oba_records (workspace_id, disclosure_status);
create index if not exists idx_oba_records_attestation_due
  on compliance_oba_records (workspace_id, next_attestation_due)
  where disclosure_status = 'active';

alter table compliance_oba_records enable row level security;

create policy "Workspace members read oba records"
  on compliance_oba_records for select to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members insert oba records"
  on compliance_oba_records for insert to authenticated
  with check (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members update oba records"
  on compliance_oba_records for update to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));

-- ── Advertising review (testimonials / endorsements) ─────────
-- SEC Rule 206(4)-1 (marketing rule, effective 2022) permits
-- testimonials and endorsements with strict disclosure
-- requirements. Every piece needs CCO review + a record of
-- what disclosures were attached. This table tracks the workflow.
create table if not exists compliance_advertising_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  submitted_by uuid references profiles(id),
  ad_type text not null,                   -- 'testimonial' | 'endorsement' | 'case_study' | 'third_party_rating' | 'social_proof' | 'other'
  source text,                             -- who gave the testimonial / where the rating came from
  content text not null,
  is_compensated boolean default false,    -- triggers compensation disclosure rule
  compensation_amount numeric,
  has_disclosure boolean default false,    -- whether the rule-required disclosure is attached
  disclosure_text text,
  status text not null default 'pending',  -- 'pending' | 'approved' | 'rejected' | 'changes_requested'
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  review_note text,
  approved_for_use_until date,
  retention_until date,                    -- 5 years from last use, per books-and-records
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_advertising_reviews_workspace_status
  on compliance_advertising_reviews (workspace_id, status);

alter table compliance_advertising_reviews enable row level security;

create policy "Workspace members read advertising reviews"
  on compliance_advertising_reviews for select to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members insert advertising reviews"
  on compliance_advertising_reviews for insert to authenticated
  with check (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members update advertising reviews"
  on compliance_advertising_reviews for update to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));

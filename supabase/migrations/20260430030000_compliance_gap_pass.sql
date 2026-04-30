-- Phase 3 gap-pass — closes #13/#14/#15/#17/#18 and the marketing rule gap.
--
-- 1. workspace_compliance_facts — ADV grounding facts the CCO maintains
--    once and the ADV draft generator pulls automatically.
-- 2. compliance_marketing_reviews.is_principal_approval — marker for
--    "this approval was performed by a registered principal" so the
--    different-user check is verifiable.

create table if not exists workspace_compliance_facts (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  -- Firm identity
  firm_legal_name text,
  firm_dba text,
  firm_address text,
  firm_phone text,
  firm_website text,
  firm_iard_crd text,                  -- CRD number from FINRA / IARD
  -- AUM (regulatory + discretionary)
  aum_regulatory numeric,              -- as of last fiscal year-end
  aum_discretionary numeric,
  aum_non_discretionary numeric,
  aum_as_of date,
  client_count integer,
  -- Ownership / management
  principal_owners text,               -- multi-line string; "Name, % owner"
  cco_name text,
  -- Services
  services_offered text,               -- "financial planning, portfolio management, retirement consulting"
  primary_custodians text,             -- "Schwab, Fidelity, Altruist"
  fee_schedule_summary text,           -- one-paragraph fee summary
  account_minimum_usd numeric,
  -- Disciplinary status
  has_material_disciplinary_events boolean default false,
  disciplinary_summary text,
  -- State registration
  is_sec_registered boolean default true,  -- false if state-registered
  state_registrations text,            -- comma-separated state codes
  -- Misc
  has_performance_fees boolean default false,
  has_custody boolean default false,
  custody_basis text,                  -- "fee deduction" | "general partner" | "qualified custodian only"
  votes_proxies boolean default false,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

alter table workspace_compliance_facts enable row level security;

create policy "Workspace members read compliance facts"
  on workspace_compliance_facts for select to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members upsert compliance facts"
  on workspace_compliance_facts for insert to authenticated
  with check (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members update compliance facts"
  on workspace_compliance_facts for update to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));

-- Marketing review: track who performed each status change so we
-- can enforce "approver != submitter" and surface principal approval.
alter table compliance_marketing_reviews
  add column if not exists is_principal_approval boolean default false;

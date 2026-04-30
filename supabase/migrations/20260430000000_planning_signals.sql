-- Contacts get a date_of_birth so the RMD analyzer can compute age.
-- Existing rows stay null. The RMD analyzer skips contacts with no
-- DOB rather than guessing.
alter table contacts add column if not exists date_of_birth date;
alter table contacts add column if not exists spouse_date_of_birth date;

-- Planning signals — output of the Phase 2 RIA planning agents.
--
-- Each row is one finding: "this client should consider a $42,000
-- Roth conversion", "this client owes a $8,300 RMD this year and has
-- distributed $0 so far", "this client's IRA names spouse as primary
-- but the trust names children — mismatch with the estate plan."
--
-- Findings are recomputed on a schedule (Mon 5am via the cron) and
-- on-demand from the per-client surface. Recomputation upserts on
-- (workspace_id, contact_id, signal_type) so the latest finding
-- always wins. Advisors can dismiss a signal — it stays in the table
-- so the runner doesn't re-surface it next week, and the audit trail
-- shows who dismissed it and when.
--
-- payload jsonb carries the structured detail the drill-down view
-- renders. Shape varies per signal_type; see lib/planning/runners.ts
-- for what each analyzer writes.

create table if not exists planning_signals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  signal_type text not null,    -- 'roth_conversion' | 'rmd_due' | 'tax_loss_harvest' | 'beneficiary_mismatch'
  severity text not null,       -- 'info' | 'warn' | 'action'
  title text not null,          -- short headline for list rows
  summary text,                 -- one-paragraph plain-English finding
  payload jsonb not null default '{}'::jsonb, -- structured detail per signal_type
  citations jsonb not null default '[]'::jsonb, -- [{kind:'doc'|'mem'|'ext', id, label}]
  computed_at timestamptz not null default now(),
  computed_by_run uuid,         -- the planning_runs row that produced this (null for ad-hoc)
  dismissed_at timestamptz,
  dismissed_by uuid references profiles(id),
  dismissed_reason text,
  created_at timestamptz not null default now(),
  unique (workspace_id, contact_id, signal_type)
);

create index if not exists idx_planning_signals_workspace
  on planning_signals (workspace_id);
create index if not exists idx_planning_signals_contact
  on planning_signals (contact_id);
create index if not exists idx_planning_signals_type
  on planning_signals (signal_type, dismissed_at);
create index if not exists idx_planning_signals_active
  on planning_signals (workspace_id, dismissed_at)
  where dismissed_at is null;

alter table planning_signals enable row level security;

create policy "Workspace members read planning_signals"
  on planning_signals for select to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));

create policy "Workspace members write planning_signals"
  on planning_signals for insert to authenticated
  with check (workspace_id in (select workspace_id from profiles where id = auth.uid()));

create policy "Workspace members update planning_signals"
  on planning_signals for update to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));

-- Run history. Each cron tick or "Run now" creates a row, which all
-- the signals it produced reference. Useful for "what did we find
-- on the Monday run vs the Thursday run" diffs.
create table if not exists planning_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  trigger text not null,        -- 'cron' | 'manual' | 'contact'
  triggered_by uuid references profiles(id),
  contact_count int default 0,
  signal_count int default 0,
  errors_count int default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_text text
);

create index if not exists idx_planning_runs_workspace
  on planning_runs (workspace_id, started_at desc);

alter table planning_runs enable row level security;

create policy "Workspace members read planning_runs"
  on planning_runs for select to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));

create policy "Workspace members write planning_runs"
  on planning_runs for insert to authenticated
  with check (workspace_id in (select workspace_id from profiles where id = auth.uid()));

create policy "Workspace members update planning_runs"
  on planning_runs for update to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));

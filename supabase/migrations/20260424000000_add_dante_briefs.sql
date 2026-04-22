-- Dante briefs — the replacement for the 0–100 churn "scoreboard".
--
-- A brief is an LLM-generated, grounded summary of *why* a specific
-- contact is at risk (or healthy) and what the advisor should do
-- about it. Every reason in the brief cites a concrete source row
-- (a note, appointment, call, or churn event) so the advisor can
-- click through and verify. Ungrounded reasons are rejected at
-- generation time, not stored.
--
-- Why this replaces dante_churn_scores for UX:
--   - 0–100 score was hand-tuned weights dressed up as precision
--   - Advisors don't trust a number they can't explain
--   - A short paragraph with citations is what they'd write themselves
--
-- Why we keep dante_churn_scores alongside: the evaluate endpoint
-- still uses it to measure top-K precision against outcomes. The
-- old score is becoming an internal metric, not a user-facing one.
--
-- Lazy generation: briefs are generated on-view (or via bulk
-- "rank my book") rather than nightly, so we cache for 24h and
-- refresh when the user reloads a contact that's stale.

create table if not exists dante_briefs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  risk_level text not null check (risk_level in ('healthy','watch','act_now','critical')),
  headline text not null,
  reasons jsonb not null default '[]'::jsonb,
  recommended_action text,
  talking_points jsonb not null default '[]'::jsonb,
  confidence numeric,
  model text,
  input_tokens integer default 0,
  output_tokens integer default 0,
  generated_at timestamptz not null default now(),
  unique (workspace_id, contact_id)
);

create index if not exists dante_briefs_workspace_risk_idx
  on dante_briefs(workspace_id, risk_level, generated_at desc);

create index if not exists dante_briefs_generated_at_idx
  on dante_briefs(workspace_id, generated_at desc);

-- RLS: mirror dante_churn_scores — authenticated users can read their
-- own workspace; writes go through the service-role client server-side.
alter table dante_briefs enable row level security;

drop policy if exists "dante_briefs read own workspace" on dante_briefs;
create policy "dante_briefs read own workspace"
  on dante_briefs for select
  to authenticated
  using (
    workspace_id in (
      select workspace_id from profiles where id = auth.uid()
    )
  );

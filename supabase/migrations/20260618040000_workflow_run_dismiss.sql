-- Let users clear workflow run results from the "Recent results" feed.
-- Soft-dismiss (keeps the row for audit/traces) — filtered out of the
-- workflows feed and the dashboard "since last login" digest so a
-- dismissed run stops resurfacing.

alter table public.dante_workflow_runs
  add column if not exists dismissed_at timestamptz;

comment on column public.dante_workflow_runs.dismissed_at is
  'When set, the run is hidden from the Recent results feed and the dashboard digest (user dismissed it).';

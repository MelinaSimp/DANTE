-- Cross-run step result cache for workflow and agent coordination.
-- Stores outputs of cacheable workflow steps (LLM calls, queries,
-- external API lookups) keyed by SHA-256 hash of workspace + step
-- type + config. Non-cacheable side-effect steps (email, SMS, etc.)
-- are never stored here.

create table if not exists dante_workflow_step_cache (
  cache_key    text        primary key,
  workspace_id uuid        not null references workspaces(id) on delete cascade,
  step_type    text        not null,
  output       jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null
);

-- Index for workspace-scoped invalidation and cleanup
create index if not exists idx_workflow_step_cache_ws
  on dante_workflow_step_cache (workspace_id);

-- Index for expired-row cleanup (cron or on-read)
create index if not exists idx_workflow_step_cache_expires
  on dante_workflow_step_cache (expires_at);

-- RLS: workspace members can read/write their own cache rows
alter table dante_workflow_step_cache enable row level security;

create policy "step_cache_workspace_access"
  on dante_workflow_step_cache
  for all
  using (
    workspace_id in (
      select workspace_id from profiles
      where id = auth.uid()
    )
  )
  with check (
    workspace_id in (
      select workspace_id from profiles
      where id = auth.uid()
    )
  );

create policy "step_cache_service"
  on dante_workflow_step_cache
  for all
  using (true)
  with check (true);

-- Periodic cleanup: delete expired rows (run via pg_cron or app-side)
-- This is a convenience function, not a cron job registration.
create or replace function cleanup_expired_step_cache()
returns integer
language plpgsql
security definer
as $$
declare
  deleted_count integer;
begin
  delete from dante_workflow_step_cache
  where expires_at < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Phase 4 — third-party integrations.
--
-- One row per (workspace, provider) connection. OAuth tokens (or
-- API keys for non-OAuth providers like Holistiplan) live in
-- credentials jsonb, encrypted at rest by Supabase. sync_state
-- tracks cursors / last-sync timestamps per provider.
--
-- Providers covered in Phase 4 (code-only, public APIs, no
-- partner approval gate):
--   wealthbox          — RIA CRM (already had MCP scaffold)
--   redtail            — RIA CRM
--   holistiplan        — tax-return planning
--   nitrogen           — risk profiling (formerly Riskalyze)
--   rightcapital       — financial planning (partner approval ~30 days)
--
-- Phase 5 providers (custodians, research, tax content) will reuse
-- this same table with provider_kind = 'custodian' / 'research' /
-- 'tax_content' / 'aggregator'. Schema is provider-agnostic.

create table if not exists integration_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null,                 -- 'wealthbox' | 'redtail' | 'holistiplan' | ...
  provider_kind text not null,            -- 'crm' | 'planning' | 'risk' | 'custodian' | 'aggregator' | 'research' | 'tax_content'
  display_name text not null,
  status text not null default 'pending', -- 'pending' | 'connected' | 'error' | 'revoked' | 'expired'
  -- OAuth / API credentials. Shape varies per provider; see the
  -- adapter file under lib/integrations/<provider>/auth.ts. Common
  -- keys: access_token, refresh_token, expires_at, api_key, scope.
  credentials jsonb not null default '{}'::jsonb,
  -- Provider-side identifiers (account ID, org ID, etc.) discovered
  -- after OAuth completes.
  external_account_id text,
  external_account_name text,
  -- Sync cursors / state. Shape varies per adapter.
  sync_state jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_sync_status text,                  -- 'ok' | 'error' | 'partial'
  last_sync_error text,
  -- Audit
  connected_by uuid references profiles(id),
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);

create index if not exists idx_integration_connections_workspace
  on integration_connections (workspace_id);
create index if not exists idx_integration_connections_provider
  on integration_connections (provider, status);

alter table integration_connections enable row level security;

create policy "Workspace members read integration_connections"
  on integration_connections for select to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members write integration_connections"
  on integration_connections for insert to authenticated
  with check (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members update integration_connections"
  on integration_connections for update to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));

-- Per-provider sync log — useful for "what happened on the Monday
-- run" forensics, just like planning_runs. Updated by each adapter
-- at the start and end of every sync.
create table if not exists integration_sync_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  connection_id uuid not null references integration_connections(id) on delete cascade,
  provider text not null,
  trigger text not null,                  -- 'cron' | 'manual' | 'webhook'
  triggered_by uuid references profiles(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  records_pulled integer default 0,
  records_upserted integer default 0,
  records_skipped integer default 0,
  errors_count integer default 0,
  error_text text,
  metadata jsonb default '{}'::jsonb
);

create index if not exists idx_sync_runs_workspace
  on integration_sync_runs (workspace_id, started_at desc);
create index if not exists idx_sync_runs_connection
  on integration_sync_runs (connection_id, started_at desc);

alter table integration_sync_runs enable row level security;

create policy "Workspace members read sync_runs"
  on integration_sync_runs for select to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members write sync_runs"
  on integration_sync_runs for insert to authenticated
  with check (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members update sync_runs"
  on integration_sync_runs for update to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));

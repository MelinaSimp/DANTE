-- Phase 4: Audit logs for enterprise compliance
--
-- Records actor + action + target for sensitive workspace events.
-- Reads are gated to workspace admins/owners via RLS.
-- Writes happen only via the service_role client in lib/audit.ts
-- so we never trust client-supplied audit records.

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,

  -- Actor. Nullable for system/cron actions. We also snapshot the
  -- email so the audit record survives profile deletion.
  actor_id uuid references profiles(id) on delete set null,
  actor_email text,

  -- Action using a dotted namespace, e.g. "agent.deployed",
  -- "workspace.member_invited", "audit_log.exported".
  action text not null,

  -- Target resource. target_id is text to allow non-uuid keys.
  target_type text,
  target_id text,
  target_label text,

  -- Free-form context. Keep small; never put PII here.
  metadata jsonb not null default '{}'::jsonb,

  ip_address text,
  user_agent text,

  created_at timestamptz not null default now()
);

create index if not exists audit_logs_workspace_created_idx
  on audit_logs(workspace_id, created_at desc);

create index if not exists audit_logs_actor_idx
  on audit_logs(actor_id);

create index if not exists audit_logs_action_idx
  on audit_logs(action);

alter table audit_logs enable row level security;

-- Only workspace admins/owners may read. Members and unrelated
-- users see nothing.
drop policy if exists "Workspace admins can read audit logs" on audit_logs;
create policy "Workspace admins can read audit logs"
  on audit_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from profiles
      where profiles.id = auth.uid()
        and profiles.workspace_id = audit_logs.workspace_id
        and profiles.role in ('admin', 'owner')
    )
  );

-- No client may insert/update/delete. Writes only via service role,
-- which bypasses RLS by design.
drop policy if exists "Nobody can write audit logs from clients" on audit_logs;
create policy "Nobody can write audit logs from clients"
  on audit_logs
  for insert
  to authenticated
  with check (false);

drop policy if exists "Nobody can update audit logs" on audit_logs;
create policy "Nobody can update audit logs"
  on audit_logs
  for update
  to authenticated
  using (false)
  with check (false);

drop policy if exists "Nobody can delete audit logs" on audit_logs;
create policy "Nobody can delete audit logs"
  on audit_logs
  for delete
  to authenticated
  using (false);

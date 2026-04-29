-- audit_events — every meaningful action in the workspace, written
-- once and immutable thereafter. The procurement-bar feature: this
-- is what FINRA/SEC compliance officers ask to see before signing,
-- and what answers "who deleted this contact?" when something goes
-- wrong.
--
-- Design constraints:
--
--   - Append-only. We don't expose UPDATE/DELETE anywhere; the
--     application layer never patches audit rows. RLS allows insert
--     by service role only (writes go through supabaseAdmin in the
--     log() helper) and select by workspace members.
--   - No cascades. References use `on delete set null` so a deleted
--     contact doesn't take its audit trail with it. The actor and
--     entity ids stay in metadata even if the live row is gone.
--   - Cheap to scan. Composite index on (workspace_id, created_at
--     desc) covers the default "show me the last N events" query;
--     a partial index on (entity_type, entity_id) covers the
--     "everything that happened to this reminder" lookup.

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,

  -- Who did this. user_id is the auth user id when known. actor_kind
  -- distinguishes user-driven actions from cron/agent/webhook so
  -- automated traffic doesn't pollute "what did Adharsh do?" filters.
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_kind text not null default 'user'
    check (actor_kind in ('user', 'agent', 'cron', 'webhook', 'system')),
  actor_label text,                                  -- human-readable; "Adharsh", "Reminders cron", etc.

  -- What happened. action is verb.noun-style ("reminder.approve",
  -- "email.send", "property.stage_change") so filtering "all email
  -- actions" is just `action like 'email.%'`.
  action text not null,
  entity_type text not null,                         -- 'reminder', 'email', 'property', 'contact', 'compliance_flag', 'document', etc.
  entity_id text,                                    -- text-typed because some sources are uuids and some are external (resend message ids, twilio sids)

  -- Free-form context. Kind-specific shape, queried as opaque blob
  -- from the export endpoint. Examples:
  --   email.send     → { subject, recipients: [...], message_id }
  --   property.stage_change → { from: 'listed', to: 'offer', address }
  --   reminder.approve → { subject, send_at, contact_id }
  metadata jsonb,

  -- Request fingerprint — useful for correlating audit rows with
  -- logs/traces and for spotting unusual access patterns.
  ip_address text,
  user_agent text,

  created_at timestamptz not null default now()
);

create index if not exists audit_events_workspace_recent_idx
  on audit_events(workspace_id, created_at desc);

create index if not exists audit_events_entity_idx
  on audit_events(workspace_id, entity_type, entity_id, created_at desc)
  where entity_id is not null;

create index if not exists audit_events_actor_idx
  on audit_events(workspace_id, actor_user_id, created_at desc)
  where actor_user_id is not null;

create index if not exists audit_events_action_idx
  on audit_events(workspace_id, action, created_at desc);

-- RLS — workspace members read; nobody writes through the API
-- directly (writes go through supabaseAdmin from the log() helper).
alter table audit_events enable row level security;

drop policy if exists "audit_events read own workspace" on audit_events;
create policy "audit_events read own workspace"
  on audit_events for select
  to authenticated
  using (
    workspace_id in (
      select workspace_id from profiles where id = auth.uid()
    )
  );

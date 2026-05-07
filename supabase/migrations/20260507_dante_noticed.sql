-- dante_noticed — generic surface for proactive notices Dante/Vergil
-- compute in the background and want the advisor/realtor to scan in
-- the morning. Cards render on the dashboard's "What [assistant]
-- noticed today" panel; urgent rows can also fan out to SMS.
--
-- The two existing notice streams (pending reminder drafts, expiring
-- property docs) keep their direct primary-table reads in the
-- dashboard endpoint. This table is for the harder kinds: cron-
-- computed contradictions, RMD deadlines, regulatory hits, stale-
-- client surfaces, anything where we'd rather not recompute on every
-- dashboard load.

create table if not exists public.dante_noticed (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,

  -- Vertical the workspace was on when the notice was generated.
  -- Stored explicitly (rather than joined live) so that flipping a
  -- workspace's industry doesn't retroactively reshape historic
  -- notices. Also lets the cron run a vertical-specific kind set.
  vertical text not null check (vertical in ('financial_advisor', 'real_estate')),

  -- Open-ended kind taxonomy. Validated in code, not in the DB —
  -- the kind list grows quickly and a check constraint would force
  -- a migration every time.
  kind text not null,
  severity text not null default 'attention'
    check (severity in ('info', 'attention', 'urgent')),

  -- Card copy. Title is one line, body is a short paragraph. Both
  -- rendered in the dashboard verbatim; render-time enrichment is
  -- discouraged — bake the names/addresses in at write time.
  title text not null,
  body text not null default '',

  -- Soft reference to the underlying entity. No FK because target_kind
  -- spans many tables (vault_item, contact, property_document,
  -- reminder, dante_memory…). The dashboard click-through resolves
  -- the route based on (target_kind, target_id).
  target_kind text,
  target_id uuid,

  -- Citation list, same jsonb shape the chat uses, so SourceViewer
  -- can open these click-throughs identically.
  citations jsonb not null default '[]'::jsonb,

  -- Dedupe key — the cron sets this so re-running the same job in the
  -- same day doesn't multiply rows. Pattern: '<kind>:<entity_id>:<bucket>'
  -- e.g. 'doc_expiring:<doc_uuid>:30d'. Required.
  dedupe_key text not null,

  created_at timestamptz not null default now(),
  -- Notices auto-expire so the dashboard never shows stale cards.
  -- Cron sets this; default 14 days for safety.
  expires_at timestamptz not null default now() + interval '14 days',
  handled_at timestamptz,
  handled_by uuid references public.profiles (id) on delete set null
);

-- Dashboard query path: by workspace, unhandled, not expired,
-- ordered by severity then recency. Severity is a 3-value string;
-- a partial index on the unhandled subset keeps the read tight even
-- when handled_at history accumulates.
create index if not exists dante_noticed_dashboard_idx
  on public.dante_noticed (workspace_id, severity, created_at desc)
  where handled_at is null;

-- Idempotency for cron re-runs. Two notices with the same dedupe_key
-- in the same workspace would be a double-firing; prevent it at the
-- DB level so a buggy job can't spam the dashboard.
create unique index if not exists dante_noticed_dedupe_idx
  on public.dante_noticed (workspace_id, dedupe_key)
  where handled_at is null;

-- Lookup by target so we can mark notices handled when the underlying
-- doc/contact/reminder is acted on elsewhere in the app.
create index if not exists dante_noticed_target_idx
  on public.dante_noticed (workspace_id, target_kind, target_id);

alter table public.dante_noticed enable row level security;

-- Workspace members can read + update (mark handled) their own
-- workspace's notices. Inserts go through the service role from the
-- cron — no end-user write path.
drop policy if exists dante_noticed_select on public.dante_noticed;
create policy dante_noticed_select on public.dante_noticed
  for select using (
    workspace_id in (
      select workspace_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists dante_noticed_update on public.dante_noticed;
create policy dante_noticed_update on public.dante_noticed
  for update using (
    workspace_id in (
      select workspace_id from public.profiles where id = auth.uid()
    )
  );

comment on table public.dante_noticed is
  'Proactive notices computed in the background by Dante/Vergil cron jobs. Cards render on the dashboard; urgent severity also fans out to SMS.';

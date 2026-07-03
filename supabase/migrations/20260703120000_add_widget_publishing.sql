-- Embeddable chat widget — publishing + anonymous conversation storage.
--
-- The agent builder can already deploy an agent to voice (Vapi) via
-- `agents.status = 'deployed'`. This migration adds an INDEPENDENT
-- web-widget channel so an agent can be embedded on any website and
-- talked to by anonymous visitors, without touching the voice deploy
-- state.
--
-- Isolation model: a widget caller is unauthenticated. They reach the
-- agent only through its `widget_public_id` (a rotatable token — NOT
-- the internal agents.id UUID). The public endpoint runs the agent
-- loop with a restricted, retrieval-only tool set scoped to the
-- agent's own workspace, so an external visitor can never reach
-- another workspace's data or any mutating/CRM tool. Anonymous turns
-- are persisted in their own tables (visitor_id, no auth.users FK)
-- rather than dante_chats (which requires a real user_id).

-- 1. Publishing columns on agents ------------------------------------

alter table public.agents
  add column if not exists widget_enabled boolean not null default false,
  add column if not exists widget_public_id text,
  add column if not exists widget_config jsonb not null default '{}'::jsonb;

-- Rotatable public token. 20 hex chars ≈ 80 bits — unguessable, and
-- regenerating it instantly kills every existing embed. Backfill
-- existing rows so no agent is left without one.
update public.agents
  set widget_public_id = substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)
  where widget_public_id is null;

alter table public.agents
  alter column widget_public_id set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);

create unique index if not exists idx_agents_widget_public_id
  on public.agents (widget_public_id);

-- 2. Anonymous widget conversations ----------------------------------

create table if not exists public.widget_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  -- Opaque per-browser id the widget generates + stores in
  -- localStorage. Lets a returning visitor resume their thread
  -- without any account. Never trusted for authz — only for
  -- grouping messages within one already-scoped conversation.
  visitor_id text,
  status text not null default 'active'
    check (status in ('active', 'resolved', 'escalated', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_widget_conversations_workspace
  on public.widget_conversations (workspace_id, updated_at desc);
create index if not exists idx_widget_conversations_agent
  on public.widget_conversations (agent_id, updated_at desc);

create table if not exists public.widget_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.widget_conversations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text,
  citation_report jsonb,
  grounding_score numeric,
  trace jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_widget_messages_conversation
  on public.widget_messages (conversation_id, created_at asc);

-- 3. RLS -------------------------------------------------------------
-- The public endpoint writes via the service role (bypasses RLS).
-- Workspace members get read access so conversations show up in the
-- dashboard / client portal / analytics. No anon write path here —
-- the public route is the only writer and it uses supabaseAdmin.

alter table public.widget_conversations enable row level security;
alter table public.widget_messages enable row level security;

drop policy if exists widget_conversations_member_read on public.widget_conversations;
create policy widget_conversations_member_read on public.widget_conversations
  for select to authenticated
  using (
    workspace_id in (select workspace_id from public.profiles where id = auth.uid())
  );

drop policy if exists widget_conversations_service on public.widget_conversations;
create policy widget_conversations_service on public.widget_conversations
  for all
  using (auth.jwt() ->> 'role' = 'service_role')
  with check (auth.jwt() ->> 'role' = 'service_role');

drop policy if exists widget_messages_member_read on public.widget_messages;
create policy widget_messages_member_read on public.widget_messages
  for select to authenticated
  using (
    workspace_id in (select workspace_id from public.profiles where id = auth.uid())
  );

drop policy if exists widget_messages_service on public.widget_messages;
create policy widget_messages_service on public.widget_messages
  for all
  using (auth.jwt() ->> 'role' = 'service_role')
  with check (auth.jwt() ->> 'role' = 'service_role');

comment on column public.agents.widget_public_id is
  'Rotatable public token for the embeddable web widget. NOT the internal id. Regenerate to revoke all embeds.';
comment on table public.widget_conversations is
  'Anonymous embeddable-widget conversations. No auth.users FK — visitors are unauthenticated.';

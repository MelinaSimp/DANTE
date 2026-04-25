-- Phase 2 — third-party integrations.
--
-- Three new tables, one shared OAuth credential store:
--   oauth_credentials  — Google (Gmail + Calendar share one grant),
--                        Microsoft Graph (mail + calendar), Wealthbox
--                        (when its OAuth lands). One row per
--                        (workspace, user, provider).
--   customer_emails    — Gmail/Outlook messages pulled by the sync
--                        job. Embeds into dante_memory once distilled.
--   calendar_events    — Google/Outlook events. Powers churn signals
--                        ("meeting cadence dropped") and dashboard
--                        briefs ("3 client meetings tomorrow").
--
-- Tokens are stored in plaintext columns here; the application layer
-- routes all writes through lib/oauth/secrets.ts which encrypts at
-- rest. Phase 3 will move encryption into a Postgres column-level
-- encryption setup once Supabase ships pgsodium more broadly.

create table if not exists oauth_credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null,                                 -- profile/auth user

  provider text not null,                                -- 'google','microsoft','wealthbox'
  scopes text[] not null default '{}',

  access_token text not null,
  refresh_token text,
  expires_at timestamptz,

  -- Stable subject identifier from the provider (Google `sub` claim,
  -- Microsoft `oid`, etc.). Use this rather than email — emails change.
  provider_subject text,
  provider_email text,

  -- Free-form provider metadata (token type, granted scopes echoed
  -- back, refresh hints).
  meta jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (workspace_id, user_id, provider)
);

create index if not exists oauth_credentials_workspace_provider
  on oauth_credentials(workspace_id, provider);

create or replace function oauth_credentials_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists oauth_credentials_touch on oauth_credentials;
create trigger oauth_credentials_touch
  before update on oauth_credentials
  for each row execute function oauth_credentials_touch_updated_at();

alter table oauth_credentials enable row level security;

-- Users can only read their OWN credential row, even within a shared
-- workspace. Refresh tokens are user-personal and we don't want the
-- "look at my coworker's mail" attack surface.
drop policy if exists "oauth_credentials read own row" on oauth_credentials;
create policy "oauth_credentials read own row"
  on oauth_credentials for select
  to authenticated
  using (user_id = auth.uid());

-- ── Customer emails ───────────────────────────────────────────

create table if not exists customer_emails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,

  -- Optional contact link — we attempt to match the from/to address
  -- against contacts.email at ingest time, but unmatched mail is
  -- still stored (it might be a referral, prospect, etc.).
  contact_id uuid references contacts(id) on delete set null,

  -- Direction relative to the advisor. Inbound = from client to advisor.
  direction text not null check (direction in ('inbound','outbound')),

  -- Provider message id (Gmail messageId / Outlook InternetMessageId).
  -- Together with workspace_id this is the dedupe key for the sync
  -- job — we resync incremental and skip rows we've seen.
  provider_message_id text not null,
  provider_thread_id text,

  from_addr text,
  to_addrs text[] not null default '{}',
  cc_addrs text[] not null default '{}',
  subject text,
  snippet text,                                         -- first ~160 chars
  body_text text,
  body_html text,

  received_at timestamptz not null,

  -- Set true once the body has been distilled into a dante_memory
  -- episode. Sync job picks the unprocessed batch each tick.
  embedded_into_memory boolean not null default false,

  created_at timestamptz not null default now(),

  unique (workspace_id, provider_message_id)
);

create index if not exists customer_emails_workspace_received_idx
  on customer_emails(workspace_id, received_at desc);

create index if not exists customer_emails_contact_idx
  on customer_emails(workspace_id, contact_id, received_at desc)
  where contact_id is not null;

create index if not exists customer_emails_unprocessed_idx
  on customer_emails(workspace_id, embedded_into_memory)
  where embedded_into_memory = false;

alter table customer_emails enable row level security;

drop policy if exists "customer_emails read own workspace" on customer_emails;
create policy "customer_emails read own workspace"
  on customer_emails for select
  to authenticated
  using (
    workspace_id in (
      select workspace_id from profiles where id = auth.uid()
    )
  );

-- ── Calendar events ───────────────────────────────────────────

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,

  provider text not null,                                -- 'google','microsoft'
  provider_event_id text not null,
  calendar_id text,

  summary text,
  description text,
  location text,

  start_at timestamptz not null,
  end_at timestamptz not null,

  -- Attendees as { email, name?, response_status? } objects.
  attendees jsonb not null default '[]'::jsonb,

  status text,                                           -- 'confirmed','tentative','cancelled'
  is_recurring boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (workspace_id, provider_event_id)
);

create index if not exists calendar_events_workspace_start_idx
  on calendar_events(workspace_id, start_at);

create index if not exists calendar_events_contact_idx
  on calendar_events(workspace_id, contact_id, start_at)
  where contact_id is not null;

create or replace function calendar_events_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists calendar_events_touch on calendar_events;
create trigger calendar_events_touch
  before update on calendar_events
  for each row execute function calendar_events_touch_updated_at();

alter table calendar_events enable row level security;

drop policy if exists "calendar_events read own workspace" on calendar_events;
create policy "calendar_events read own workspace"
  on calendar_events for select
  to authenticated
  using (
    workspace_id in (
      select workspace_id from profiles where id = auth.uid()
    )
  );

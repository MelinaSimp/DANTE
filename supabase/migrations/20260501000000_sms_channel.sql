-- SMS channel — Drift's iMessage/SMS interface.
--
-- The architectural call is to NOT run a separate microservice for
-- texting (cf. drift-chat repo). Instead, route inbound SMS through
-- the same dante_memory + audit_events + workspace RLS the web app
-- uses, so a fact remembered from texting is visible in the web app
-- and vice versa.
--
-- Tables added here:
--
--   profiles.sms_phone, sms_verified_at, sms_briefing_enabled,
--   sms_quiet_start, sms_quiet_end, sms_timezone — per-user prefs.
--
--   sms_phone_verifications — 6-digit code flow. Code is hashed
--   (sha256) at rest; we never store the plaintext. 10-min TTL.
--
--   sms_processed_messages — idempotency on inbound SendBlue
--   webhooks. SendBlue retries on 5xx; this dedup prevents the
--   agent from running twice on the same incoming text.
--
--   sms_messages — append-only conversation log. Both directions.
--   Workspace-scoped, RLS-bound. Powers the agent's recent-history
--   context window AND surfaces texted actions in the audit log.

-- ── Per-user SMS prefs ──────────────────────────────────────
alter table profiles add column if not exists sms_phone text;
alter table profiles add column if not exists sms_verified_at timestamptz;
alter table profiles add column if not exists sms_briefing_enabled boolean default false;
alter table profiles add column if not exists sms_quiet_start time;
alter table profiles add column if not exists sms_quiet_end time;
alter table profiles add column if not exists sms_timezone text default 'America/New_York';

-- Phone is globally unique across all users. Routing inbound
-- texts requires a 1:1 phone→user mapping; if two users tried to
-- claim the same number Drift wouldn't know whose workspace to
-- run against.
create unique index if not exists uq_profiles_sms_phone
  on profiles (sms_phone)
  where sms_phone is not null;

-- ── Phone verification (6-digit code) ───────────────────────
create table if not exists sms_phone_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  phone text not null,                  -- E.164 (+15551234567)
  code_hash text not null,              -- sha256(plaintext code), never the code itself
  attempts integer not null default 0,
  consumed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_sms_verifications_user
  on sms_phone_verifications (user_id, created_at desc);
alter table sms_phone_verifications enable row level security;
create policy "Users read own sms verifications"
  on sms_phone_verifications for select to authenticated
  using (user_id = auth.uid());
create policy "Users insert own sms verifications"
  on sms_phone_verifications for insert to authenticated
  with check (user_id = auth.uid());
create policy "Users update own sms verifications"
  on sms_phone_verifications for update to authenticated
  using (user_id = auth.uid());

-- ── Inbound dedup ──────────────────────────────────────────
create table if not exists sms_processed_messages (
  message_id text primary key,
  phone text not null,
  user_id uuid references profiles(id) on delete set null,
  workspace_id uuid references workspaces(id) on delete set null,
  received_at timestamptz not null default now()
);
create index if not exists idx_sms_processed_received
  on sms_processed_messages (received_at desc);

-- No RLS on processed_messages — it's a server-only dedup table
-- written by the webhook (service role) and never queried by users.

-- ── Conversation log ───────────────────────────────────────
create table if not exists sms_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  phone text not null,                  -- the user's E.164
  direction text not null,              -- 'inbound' | 'outbound'
  body text not null,
  message_id text,                      -- SendBlue id (inbound only typically)
  agent_run_id uuid,                    -- correlates a turn's inbound + outbound
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_sms_messages_user_created
  on sms_messages (user_id, created_at desc);
create index if not exists idx_sms_messages_workspace_created
  on sms_messages (workspace_id, created_at desc);

alter table sms_messages enable row level security;
create policy "Workspace members read sms_messages"
  on sms_messages for select to authenticated
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "Workspace members write sms_messages"
  on sms_messages for insert to authenticated
  with check (workspace_id in (select workspace_id from profiles where id = auth.uid()));

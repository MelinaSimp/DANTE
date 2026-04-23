-- Zoom Cloud Recording integration.
--
-- Per-workspace credentials for a Zoom Server-to-Server OAuth app.
-- The advisor pastes account_id / client_id / client_secret / webhook_secret
-- once; the app uses them to create meetings on the advisor's Zoom account
-- and to verify incoming recording.completed webhooks.
--
-- client_secret + webhook_secret are encrypted at rest (see
-- lib/crypto/secrets.ts). account_id and client_id are identifiers, not
-- secrets, and stay plaintext so support can sanity-check them.

create table if not exists zoom_credentials (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  account_id text not null,
  client_id text not null,
  client_secret text not null,
  webhook_secret text not null,
  zoom_user_email text,
  zoom_account_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table zoom_credentials enable row level security;

-- Members can read (to show "Connected as X" in settings) but only admins
-- can mutate. Admin checks happen in the API layer; the RLS policy here
-- is a second line of defense.
drop policy if exists zoom_credentials_select on zoom_credentials;
create policy zoom_credentials_select on zoom_credentials
  for select using (
    workspace_id in (
      select workspace_id from profiles where id = auth.uid()
    )
  );

drop policy if exists zoom_credentials_service on zoom_credentials;
create policy zoom_credentials_service on zoom_credentials
  for all using (auth.jwt() ->> 'role' = 'service_role');

-- Extra columns on call_recordings so the Zoom lifecycle can be tracked
-- end-to-end: we create the meeting, save start/join URLs for the UI,
-- then match the webhook payload by zoom_meeting_uuid (NOT meeting_id —
-- Zoom reuses meeting_id across instances of a recurring meeting).
alter table call_recordings
  add column if not exists zoom_meeting_uuid text,
  add column if not exists zoom_join_url text,
  add column if not exists zoom_start_url text;

create index if not exists call_recordings_zoom_uuid_idx
  on call_recordings(zoom_meeting_uuid)
  where zoom_meeting_uuid is not null;

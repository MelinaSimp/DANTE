-- Call recordings: browser + Zoom-sourced meeting recordings, per-client.
-- Transcripts + summaries get written into the existing `notes` table; this
-- table tracks the raw recording lifecycle (upload → transcribe → summarize).

create table if not exists call_recordings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  contact_id uuid not null references contacts(id) on delete cascade,
  user_id uuid not null,
  source text not null default 'browser', -- 'browser' | 'zoom'
  storage_path text,
  duration_seconds integer,
  status text not null default 'uploading',
  -- uploading | transcribing | summarizing | done | error
  transcript text,
  summary text,
  error text,
  note_id uuid references notes(id) on delete set null,
  zoom_meeting_id text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists call_recordings_contact_idx
  on call_recordings(contact_id, created_at desc);
create index if not exists call_recordings_workspace_idx
  on call_recordings(workspace_id, created_at desc);

alter table call_recordings enable row level security;

drop policy if exists call_recordings_select on call_recordings;
create policy call_recordings_select on call_recordings
  for select using (
    workspace_id in (
      select workspace_id from profiles where id = auth.uid()
    )
  );

drop policy if exists call_recordings_insert on call_recordings;
create policy call_recordings_insert on call_recordings
  for insert with check (
    user_id = auth.uid()
    and workspace_id in (
      select workspace_id from profiles where id = auth.uid()
    )
  );

drop policy if exists call_recordings_update on call_recordings;
create policy call_recordings_update on call_recordings
  for update using (
    workspace_id in (
      select workspace_id from profiles where id = auth.uid()
    )
  );

drop policy if exists call_recordings_service on call_recordings;
create policy call_recordings_service on call_recordings
  for all using (auth.jwt() ->> 'role' = 'service_role');

-- Private storage bucket for raw audio files.
insert into storage.buckets (id, name, public)
values ('call-recordings', 'call-recordings', false)
on conflict (id) do nothing;

-- Path convention: {workspace_id}/{recording_id}.webm
-- Upload/read policies restrict to the user's own workspace folder.

drop policy if exists call_recordings_storage_insert on storage.objects;
create policy call_recordings_storage_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'call-recordings'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from profiles where id = auth.uid()
    )
  );

drop policy if exists call_recordings_storage_select on storage.objects;
create policy call_recordings_storage_select on storage.objects
  for select to authenticated using (
    bucket_id = 'call-recordings'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from profiles where id = auth.uid()
    )
  );

drop policy if exists call_recordings_storage_delete on storage.objects;
create policy call_recordings_storage_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'call-recordings'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from profiles where id = auth.uid()
    )
  );

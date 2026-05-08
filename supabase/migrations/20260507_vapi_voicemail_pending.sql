-- vapi_voicemail_pending — small lookup table that flags VAPI calls
-- as voicemail-only mid-call. Set by the send_to_voicemail tool
-- handler before end-of-call-report fires; read by the end-of-call
-- handler to decide whether to email the advisor a transcript +
-- recording link.
--
-- Why not stash on the conversation: the conversations row isn't
-- created until end-of-call-report runs, so we'd be writing to a
-- row that doesn't exist. A separate keyed-by-vapi_call_id table
-- keeps the lookup explicit and lets us garbage-collect easily.

create table if not exists public.vapi_voicemail_pending (
  vapi_call_id text primary key,
  greeting text,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

-- Cleanup query (run periodically): rows older than 7 days that
-- already had their email sent (consumed_at is set) can go. Rows
-- older than 7 days with consumed_at null mean we never got the
-- end-of-call-report — also drop, the call's recording is gone.
create index if not exists vapi_voicemail_pending_created_idx
  on public.vapi_voicemail_pending (created_at);

-- No RLS needed — service-role only writes/reads this table; it's
-- never exposed to end users.
alter table public.vapi_voicemail_pending enable row level security;

comment on table public.vapi_voicemail_pending is
  'Tracks which active VAPI calls are voicemail-only, so end-of-call-report can email the advisor with the transcript + recording.';

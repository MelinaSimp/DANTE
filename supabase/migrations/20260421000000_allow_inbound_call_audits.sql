-- Inbound AI call audits (VAPI end-of-call-report → call_recordings).
--
-- Before this, call_recordings required a logged-in user_id because the
-- only entry point was the advisor clicking "Record call" in the browser.
-- Inbound receptionist calls end via a Twilio/VAPI webhook with no user
-- session — the webhook runs server-to-server, uses service role, and
-- has no auth.uid() to attribute the row to.
--
-- Approach: drop the NOT NULL on user_id. Manual recordings still set
-- it (the RLS insert policy at creation still requires it for
-- user-initiated rows). Inbound rows leave it null and are created via
-- service role, which bypasses RLS.
--
-- `source` column already exists and defaults to 'browser'. Inbound
-- webhook rows will set source = 'inbound_vapi' so the UI and analytics
-- can distinguish them later if needed.
--
-- external_call_id lets us dedupe on webhook retries: VAPI will resend
-- end-of-call-report on 5xx, and we don't want duplicate audits. The
-- manual-recording flow leaves it null.

alter table call_recordings
  alter column user_id drop not null;

alter table call_recordings
  add column if not exists external_call_id text;

create unique index if not exists call_recordings_workspace_external_call_idx
  on call_recordings(workspace_id, external_call_id)
  where external_call_id is not null;

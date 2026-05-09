-- Per-call-type voicemail routing.
--
-- Extends vapi_voicemail_pending with the metadata needed to dispatch
-- a transcript-by-SMS notification to a destination chosen by the
-- scenario voicemail node (e.g. "Property Management" → +15551110001,
-- "Accounting" → +15551110002). All three columns are optional —
-- voicemail nodes without routing fall back to the existing
-- workspace-owner email path.

alter table public.vapi_voicemail_pending
  add column if not exists label    text,
  add column if not exists sms_to   text,
  add column if not exists email_to text;

comment on column public.vapi_voicemail_pending.label is
  'Voicemail step label (e.g. "Property Management") — surfaces in the SMS/email subject so the recipient knows what bucket the call fell into.';
comment on column public.vapi_voicemail_pending.sms_to is
  'E.164 phone number to receive the transcript + recording link by SMS. Null = no SMS dispatch.';
comment on column public.vapi_voicemail_pending.email_to is
  'Override recipient email. Null = falls back to workspace owner.';

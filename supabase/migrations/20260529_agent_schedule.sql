-- Per-agent business-hours schedule + after-hours transfer routing.
--
-- A voice agent in scenario mode can opt into a weekly schedule. When
-- a call comes in, VAPI hits our assistant-request webhook; we look at
-- the schedule + current time in the agent's timezone, and either:
--   • in-hours  → return { assistantId: <regular> }  → normal scenario flow
--   • after-hours, transfer set    → return a dynamic assistant config
--                                    that bridges to `after_hours_transfer_to`
--   • after-hours, no transfer set → polite "we're closed" + end call
--
-- Schedule shape (jsonb):
--   {
--     "timezone": "America/New_York",          // optional override; defaults to APP_TIMEZONE
--     "windows": {
--       "mon": [{"start":"09:00","end":"17:00"}],
--       "tue": [{"start":"09:00","end":"12:00"},{"start":"13:00","end":"17:00"}],
--       "sat": [],   // empty array = closed all day
--       "sun": []
--     }
--   }
--
-- Stored as opaque jsonb so the shape can evolve (e.g. holiday list,
-- recurring exceptions) without migrations.

alter table public.agents
  add column if not exists schedule_enabled boolean not null default false,
  add column if not exists schedule jsonb,
  add column if not exists after_hours_transfer_to text;

comment on column public.agents.schedule_enabled is
  'When true, inbound calls go through the schedule check at the assistant-request webhook. When false, calls land on vapi_assistant_id directly with no schedule check.';
comment on column public.agents.schedule is
  'Weekly schedule jsonb: { timezone?: string, windows: { mon|tue|wed|thu|fri|sat|sun: [{start,end}] } }. Times are HH:MM in the schedule timezone (defaults to APP_TIMEZONE).';
comment on column public.agents.after_hours_transfer_to is
  'E.164 phone number callers are bridged to outside business hours. When null, after-hours calls hear a brief "we are closed" message and the call ends.';

-- 20260510_noticer_agent.sql
--
-- Per-workspace toggles + daily cost cap for the autonomous noticer
-- agent (lib/dante/noticed/agent.ts). The agent runs nightly out of
-- /api/dante/cron/notices after the deterministic computers, looking
-- at recent activity, vault changes, regulatory hits, and calendar
-- to surface things that don't fit a hardcoded SQL pattern.
--
-- Defaults are conservative: every workspace has the agent on, with
-- a $0.15/day spend cap. Admin can flip either knob per customer
-- from /admin/customers/[id].

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS noticer_agent_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS noticer_daily_cap_cents integer NOT NULL DEFAULT 15;

COMMENT ON COLUMN public.workspaces.noticer_agent_enabled IS
  'When false, the autonomous noticer agent is skipped for this workspace. Deterministic computers (client_stale, regulatory_client_impact, etc.) still run.';
COMMENT ON COLUMN public.workspaces.noticer_daily_cap_cents IS
  'Hard daily $ cap for the noticer agent (cents). Cron checks dante_usage_ledger for today''s spend tagged feature=''noticer_agent'' before launch and aborts if over.';

-- 20260523_workflow_hardening.sql
--
-- Production hardening for workflow system:
-- 1. Rate limiting counters for email/SMS sends
-- 2. Atomic increment function for serverless-safe rate checks
-- 3. Index for execution lock queries (active runs per workflow)

-- ── Rate limiting counters ──────────────────────────────────
-- Per-workspace, per-channel, per-hour window. Each row tracks
-- how many sends have been made in a given hour window.

CREATE TABLE IF NOT EXISTS public.dante_send_counters (
  workspace_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  window_start timestamptz NOT NULL,
  send_count int NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, channel, window_start)
);

-- Atomic upsert+increment. Returns the new count AFTER incrementing.
-- Called from the workflow runner before each send to check + track
-- usage in a single round-trip.

CREATE OR REPLACE FUNCTION public.increment_send_counter(
  p_workspace_id uuid,
  p_channel text,
  p_window_start timestamptz,
  p_count int DEFAULT 1
) RETURNS int
LANGUAGE sql
AS $$
  INSERT INTO public.dante_send_counters (workspace_id, channel, window_start, send_count)
  VALUES (p_workspace_id, p_channel, p_window_start, p_count)
  ON CONFLICT (workspace_id, channel, window_start)
  DO UPDATE SET send_count = dante_send_counters.send_count + EXCLUDED.send_count
  RETURNING send_count;
$$;

-- Clean up old counter rows (older than 48h) to prevent table bloat.
-- Can be called from a daily cron or left to manual cleanup.

CREATE OR REPLACE FUNCTION public.cleanup_send_counters()
RETURNS int
LANGUAGE sql
AS $$
  WITH deleted AS (
    DELETE FROM public.dante_send_counters
    WHERE window_start < now() - interval '48 hours'
    RETURNING 1
  )
  SELECT count(*)::int FROM deleted;
$$;

-- ── Execution lock index ────────────────────────────────────
-- Fast lookup for "does this workflow have an active run?" check
-- in enqueueRun(). Partial index only covers active statuses.

CREATE INDEX IF NOT EXISTS idx_dante_runs_active_per_workflow
  ON public.dante_workflow_runs (workflow_id)
  WHERE status IN ('queued', 'running');

-- ── Cancelled status support ────────────────────────────────
-- Index for the cancel endpoint to quickly find runs by ID+status.
-- The existing PK covers id lookups, but the status filter benefits
-- from a partial index for the queue tick's stale-run recovery.

CREATE INDEX IF NOT EXISTS idx_dante_runs_cancelled
  ON public.dante_workflow_runs (id)
  WHERE status = 'cancelled';

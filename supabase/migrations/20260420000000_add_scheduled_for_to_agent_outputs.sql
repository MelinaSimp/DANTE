-- Add a scheduled_for column to wm_agent_outputs so agent recommendations
-- with a target date (e.g. "follow up Friday") can auto-dismiss from the
-- dashboard once the date passes. NULL means "no date" — shown
-- indefinitely until the advisor acts. Non-NULL past dates are filtered
-- out of the pending queue by the dashboard.

ALTER TABLE wm_agent_outputs
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_wm_agent_outputs_scheduled_for
  ON wm_agent_outputs (workspace_id, review_status, scheduled_for)
  WHERE scheduled_for IS NOT NULL;

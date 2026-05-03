-- 20260503_workflow_trigger_at.sql
--
-- One-shot scheduling for the workflow runner. Adds two columns to
-- dante_workflows:
--
--   next_fire_at  — when the trigger_at workflow should run. Set on
--                   create, NULLed after fire so the same run never
--                   repeats.
--   fired_at      — audit-only; when the trigger_at run actually
--                   went off. Populated alongside the next_fire_at
--                   clear.
--
-- Indexed on (next_fire_at) WHERE next_fire_at IS NOT NULL so the
-- cron tick's "give me workflows ready to fire" query is a partial
-- index hit, not a full scan.
--
-- See lib/dante/workflow-types.ts (TriggerAtStep) and
-- app/api/dante/cron/tick/route.ts for the runtime side.

ALTER TABLE dante_workflows
  ADD COLUMN IF NOT EXISTS next_fire_at timestamptz,
  ADD COLUMN IF NOT EXISTS fired_at     timestamptz;

CREATE INDEX IF NOT EXISTS idx_dante_workflows_next_fire_at
  ON dante_workflows (next_fire_at)
  WHERE next_fire_at IS NOT NULL;

COMMENT ON COLUMN dante_workflows.next_fire_at IS
  'For trigger_at one-shot workflows: ISO timestamp the run should fire at. NULL after fire (or for non-trigger_at workflows).';
COMMENT ON COLUMN dante_workflows.fired_at IS
  'For trigger_at one-shot workflows: when the run actually fired. Audit-only; the workflow remains visible in /reminders so the user can see what happened.';

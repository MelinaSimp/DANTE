-- 20260605_usage_workflow_attribution.sql
--
-- Add workflow_id and workflow_run_id columns to dante_usage_ledger
-- so we can attribute LLM costs to specific workflows. This enables
-- per-workflow cost reporting in the usage dashboard.

ALTER TABLE dante_usage_ledger
  ADD COLUMN IF NOT EXISTS workflow_id uuid,
  ADD COLUMN IF NOT EXISTS workflow_run_id uuid;

-- Index for per-workflow cost aggregation
CREATE INDEX IF NOT EXISTS idx_usage_ledger_workflow
  ON dante_usage_ledger (workspace_id, workflow_id, created_at DESC)
  WHERE workflow_id IS NOT NULL;

COMMENT ON COLUMN dante_usage_ledger.workflow_id IS
  'FK to dante_workflows.id when this cost was incurred by a workflow execution. NULL for chat-driven calls.';
COMMENT ON COLUMN dante_usage_ledger.workflow_run_id IS
  'FK to dante_workflow_runs.id for the specific run. NULL for chat-driven calls.';

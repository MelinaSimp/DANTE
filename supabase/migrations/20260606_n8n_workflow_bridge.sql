-- 20260606_n8n_workflow_bridge.sql
--
-- Adds n8n integration columns to support the workflow engine migration.
-- dante_workflows gets an n8n_workflow_id foreign reference.
-- dante_workflow_runs gets an n8n_execution_id for push-callback upserts.

-- Link Drift workflows to their n8n counterpart
ALTER TABLE dante_workflows
  ADD COLUMN IF NOT EXISTS n8n_workflow_id TEXT;

CREATE INDEX IF NOT EXISTS idx_workflows_n8n_id
  ON dante_workflows(n8n_workflow_id)
  WHERE n8n_workflow_id IS NOT NULL;

-- Link Drift run records to n8n execution IDs (for push-callback upserts)
ALTER TABLE dante_workflow_runs
  ADD COLUMN IF NOT EXISTS n8n_execution_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_n8n_execution_id
  ON dante_workflow_runs(n8n_execution_id)
  WHERE n8n_execution_id IS NOT NULL;

-- Comment for clarity
COMMENT ON COLUMN dante_workflows.n8n_workflow_id IS
  'n8n workflow ID for workflows executing on the n8n backend. NULL for legacy custom-engine workflows.';

COMMENT ON COLUMN dante_workflow_runs.n8n_execution_id IS
  'n8n execution ID. Used as upsert key by the execution callback endpoint.';

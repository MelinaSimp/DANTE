ALTER TABLE public.dante_workflow_runs
  ADD COLUMN IF NOT EXISTS paused_at_node text,
  ADD COLUMN IF NOT EXISTS approval_context jsonb;

CREATE INDEX IF NOT EXISTS idx_dante_runs_waiting_approval
  ON public.dante_workflow_runs (workspace_id, started_at DESC)
  WHERE status = 'waiting_approval';

CREATE TABLE IF NOT EXISTS public.dante_approval_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES dante_workflow_runs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  action text NOT NULL DEFAULT 'approve',
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_tokens_token
  ON public.dante_approval_tokens (token) WHERE used_at IS NULL;

ALTER TABLE public.dante_approval_tokens ENABLE ROW LEVEL SECURITY;

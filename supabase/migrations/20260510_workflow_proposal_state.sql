-- 20260510_workflow_proposal_state.sql
--
-- Workflow proposals from the chat agent (and from the noticer
-- agent's `workflow.propose` tool). A proposed workflow is written
-- to dante_workflows with `enabled = false` (so cron/tick already
-- skips it) and `proposal_state = 'pending'` so the UI can offer
-- Accept / Decline.
--
-- On Accept: proposal_state set to NULL, enabled set to true.
-- On Decline: row deleted.
--
-- We keep proposal_state as a separate column rather than a new
-- enum on `enabled` because the existing cron/tick filter already
-- reads `enabled = true` as the canonical "this workflow can fire"
-- gate. Mixing in a status enum would force changes across every
-- writer in the codebase. proposal_state is purely UI state.

ALTER TABLE public.dante_workflows
  ADD COLUMN IF NOT EXISTS proposal_state text
    CHECK (proposal_state IS NULL OR proposal_state IN ('pending', 'accepted'));

CREATE INDEX IF NOT EXISTS dante_workflows_proposal_pending_idx
  ON public.dante_workflows (workspace_id, created_at DESC)
  WHERE proposal_state = 'pending';

COMMENT ON COLUMN public.dante_workflows.proposal_state IS
  'Set to ''pending'' when the chat or noticer agent proposed this workflow but the user has not yet accepted. NULL means "user-owned" (either accepted from a proposal or created directly). Cron/tick continues to gate on enabled=true; this column is UI state for the Accept/Decline affordance.';

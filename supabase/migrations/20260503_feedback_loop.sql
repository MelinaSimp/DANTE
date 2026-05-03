-- 20260503_feedback_loop.sql
--
-- Phase 8 W8.4 — auto-improvement feedback loop.
--
-- Captures thumbs-up/down on chat responses + optional reviewer
-- comment. AI lead converts the best signals into eval tasks
-- weekly; the table is the source of truth for what's been
-- promoted to evals.

CREATE TABLE IF NOT EXISTS chat_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  -- Reference the chat message (nullable so cleanup is graceful).
  chat_message_id uuid,
  -- Snapshot of the user's input + agent's output at feedback time
  -- so the eval team has reproducible context even if the chat is
  -- later deleted.
  user_input text NOT NULL,
  agent_output text NOT NULL,
  -- Vote.
  vote text NOT NULL CHECK (vote IN ('up', 'down')),
  -- Free-form note from the user.
  comment text,
  -- Promotion state. 'pending' = awaiting AI lead review; 'promoted'
  -- = converted into an eval task; 'dismissed' = not actionable.
  triage_status text NOT NULL DEFAULT 'pending'
    CHECK (triage_status IN ('pending', 'promoted', 'dismissed')),
  promoted_to_eval_id text,    -- the eval task slug if promoted
  triaged_by uuid REFERENCES auth.users(id),
  triaged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_feedback_pending_review
  ON chat_feedback (workspace_id, created_at DESC)
  WHERE triage_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_chat_feedback_downvotes
  ON chat_feedback (workspace_id, created_at DESC)
  WHERE vote = 'down' AND triage_status = 'pending';

ALTER TABLE chat_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_feedback_self_insert ON chat_feedback;
CREATE POLICY chat_feedback_self_insert ON chat_feedback
  FOR INSERT
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS chat_feedback_workspace_select ON chat_feedback;
CREATE POLICY chat_feedback_workspace_select ON chat_feedback
  FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE chat_feedback IS
  'Phase 8 W8.4 — thumbs-up/down feedback on chat responses. AI lead promotes the best down-vote signals into eval tasks weekly.';

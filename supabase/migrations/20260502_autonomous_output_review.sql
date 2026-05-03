-- 20260502_autonomous_output_review.sql
--
-- Phase 1 W1.3 — Supervisor review for autonomous outputs.
--
-- Drift's autonomous agents and scheduled reminders can produce
-- client-facing artifacts (emails, SMS, drafted memos). For RIAs
-- this brushes against FINRA 3110 / SEC 206(4)-7 supervision
-- requirements; for realtor brokerages it brushes against
-- designated-broker oversight.
--
-- This migration introduces a generic outbound_review_queue table
-- that any autonomous producer can stage drafts into. Sends are
-- gated on review_status='approved'. Sends triggered directly by an
-- authenticated user typing into the UI bypass the queue (their
-- click IS the supervisory event for the workspace's policy).
--
-- The reminders table already has status='draft', but its scope is
-- per-feature. This table is the cross-cutting one — every
-- autonomous output type registers here so a single queue UI shows
-- everything awaiting approval.

CREATE TABLE IF NOT EXISTS outbound_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- What kind of artifact this is. Open string so new producers can
  -- register without a migration; UI groups by this. Examples:
  --   'email', 'sms', 'reminder.email', 'agent.summary',
  --   'workflow.email', 'autonomous.opportunity'
  kind text NOT NULL,

  -- Free-form payload — the actual content + any context the UI
  -- needs to render an approve/reject decision. Shape varies by
  -- kind; consumers parse against an expected schema.
  payload jsonb NOT NULL,

  -- Where this came from, so the queue UI can link back. NULL when
  -- the producer is generic (cron, ad-hoc batch).
  source_kind text,           -- 'autonomous_agent','workflow','reminder',...
  source_id uuid,             -- the agent_id, workflow_run_id, reminder_id, etc.
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,

  -- Review state. 'pending' is the default; reviewers transition to
  -- 'approved' (which triggers the actual send via the producer's
  -- callback) or 'rejected' (kept for audit).
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'sent', 'failed')),

  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_note text,

  -- Producer-supplied callback the system invokes once approved.
  -- Stored as a route + opaque data. Keeps the queue generic — it
  -- doesn't need to know how to send an email vs SMS.
  send_callback_route text,
  send_callback_data jsonb,

  -- Send result (when review_status='sent' or 'failed').
  sent_at timestamptz,
  send_error text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbound_review_pending
  ON outbound_review_queue (workspace_id, created_at DESC)
  WHERE review_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_outbound_review_contact
  ON outbound_review_queue (workspace_id, contact_id)
  WHERE contact_id IS NOT NULL;

-- Updated_at trigger.
CREATE OR REPLACE FUNCTION outbound_review_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_outbound_review_updated_at ON outbound_review_queue;
CREATE TRIGGER trg_outbound_review_updated_at
  BEFORE UPDATE ON outbound_review_queue
  FOR EACH ROW
  EXECUTE FUNCTION outbound_review_set_updated_at();

-- RLS — workspace members can read their own queue; only authenticated
-- users (via app, not anon) can write. Service role used by the
-- backend bypasses RLS for the actual send.
ALTER TABLE outbound_review_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outbound_review_select ON outbound_review_queue;
CREATE POLICY outbound_review_select ON outbound_review_queue
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS outbound_review_update ON outbound_review_queue;
CREATE POLICY outbound_review_update ON outbound_review_queue
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

COMMENT ON TABLE outbound_review_queue IS
  'Phase 1 W1.3 — supervisor review queue for autonomous client-facing outputs. Gates email/SMS/draft sends from any non-user-driven producer.';

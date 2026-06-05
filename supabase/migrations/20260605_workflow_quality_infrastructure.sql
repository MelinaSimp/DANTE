-- Phase 2: Workflow quality infrastructure
-- Step-level checkpoints, idempotency tokens, dead-letter queue
-- 2026-06-05

-- ── Step-level checkpoints ─────────────────────────────────────
-- After each node executes, persist its output so a crash mid-run
-- can resume from the last checkpoint rather than re-executing
-- everything (and re-sending emails, etc.).

CREATE TABLE IF NOT EXISTS dante_workflow_run_checkpoints (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id     text NOT NULL,
  node_id    text NOT NULL,
  node_type  text NOT NULL,
  output     jsonb,
  status     text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'skipped')),
  fired_at   timestamptz DEFAULT now(),
  UNIQUE(run_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_run
  ON dante_workflow_run_checkpoints(run_id);

-- ── Idempotency tokens ─────────────────────────────────────────
-- For side-effect nodes (send_email, send_sms, update_contact,
-- http POST/PUT/PATCH/DELETE, generate_document): hash
-- (run_id + node_id) into an idempotency key. If the key already
-- exists, return the cached output instead of re-executing.
-- This prevents duplicate emails on crash-resume.

CREATE TABLE IF NOT EXISTS dante_workflow_idempotency (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  run_id          text NOT NULL,
  node_id         text NOT NULL,
  output          jsonb,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idempotency_run
  ON dante_workflow_idempotency(run_id);

-- ── Dead-letter queue ──────────────────────────────────────────
-- Failed workflow runs land here for manual inspection or replay.
-- Workspace admins see these in a "Failed runs" panel and can
-- retry or discard.

CREATE TABLE IF NOT EXISTS dante_workflow_dead_letters (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id        text,
  workflow_id   uuid NOT NULL,
  workspace_id  uuid NOT NULL,
  node_id       text,
  node_type     text,
  error_message text NOT NULL,
  error_context jsonb,
  input         jsonb,
  status        text DEFAULT 'pending' CHECK (status IN ('pending', 'retried', 'discarded')),
  created_at    timestamptz DEFAULT now(),
  resolved_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_dead_letters_workspace_status
  ON dante_workflow_dead_letters(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_dead_letters_workflow
  ON dante_workflow_dead_letters(workflow_id);

-- RLS policies — workspace-scoped access

ALTER TABLE dante_workflow_run_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE dante_workflow_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE dante_workflow_dead_letters ENABLE ROW LEVEL SECURITY;

-- Checkpoints: read via service role only (runner writes, UI reads through API)
CREATE POLICY "service_role_all_checkpoints" ON dante_workflow_run_checkpoints
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_idempotency" ON dante_workflow_idempotency
  FOR ALL USING (auth.role() = 'service_role');

-- Dead letters: workspace members can read their own
CREATE POLICY "service_role_all_dead_letters" ON dante_workflow_dead_letters
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "workspace_members_read_dead_letters" ON dante_workflow_dead_letters
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

-- 20260502_mcp_allowlist_and_unread.sql
--
-- Two small, related Phase 3+ migrations bundled because they're
-- both "presence/absence + audit" tables and the apply window is
-- the same.

-- ── MCP allowlist (Elena, Phase 3 W3.8) ──────────────────────────
--
-- Today: mcp_servers can be added by anyone with workspace access.
-- That's a PII exfiltration vector — every tool call routed through
-- an MCP server passes payloads (potentially containing client
-- data) to a third-party endpoint.
--
-- After this migration: mcp_servers gains an `approval_status`
-- column. New rows default to 'pending'. The agent loop's
-- expandMcpTools() filters to 'approved' only — pending servers
-- contribute zero tools.
--
-- Workspace admins (profiles.is_workspace_admin = true) approve in
-- the settings UI. Approval writes to audit_logs for examiners.

ALTER TABLE mcp_servers
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_note text,

  -- Per-server PII redaction policy. JSON because the rule shape
  -- evolves (regex list now, schema-aware later). Default: redact
  -- emails + phone numbers from all outbound payloads.
  ADD COLUMN IF NOT EXISTS redaction_policy jsonb NOT NULL DEFAULT '{
    "redact_email": true,
    "redact_phone": true,
    "redact_ssn": true,
    "custom_patterns": []
  }'::jsonb;

-- Backfill legacy rows. Anything currently in the table predates
-- the allowlist gate; rather than break working integrations we
-- mark them approved with a note. New rows from this point default
-- to pending.
UPDATE mcp_servers
SET approval_status = 'approved',
    approval_note = 'auto-approved by 20260502 migration (pre-allowlist)',
    approved_at = now()
WHERE approval_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_mcp_servers_approved
  ON mcp_servers (workspace_id) WHERE approval_status = 'approved';

COMMENT ON COLUMN mcp_servers.approval_status IS
  'Phase 3 W3.8 — workspace-admin gate on MCP server use. Pending servers contribute zero tools to the agent loop.';

-- ── Unread tracking (Tomás, Phase 3 W3.1) ────────────────────────
--
-- Per-(user, resource_type, resource_id) read marker. Resource
-- types include:
--   'dante_chat'        — message threads
--   'review_queue_item' — outbound_review_queue rows
--   'memory_review'     — pending dante_memory rows
--   'compliance_flag'   — flagged compliance items
--   'agent_output'      — autonomous agent outputs
--
-- The badge counts in the nav read from this table via simple
-- per-user aggregations.

CREATE TABLE IF NOT EXISTS user_read_markers (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, resource_type, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_user_read_markers_workspace
  ON user_read_markers (user_id, workspace_id, resource_type);

ALTER TABLE user_read_markers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS read_markers_self ON user_read_markers;
CREATE POLICY read_markers_self ON user_read_markers
  FOR ALL
  USING (user_id = auth.uid());

COMMENT ON TABLE user_read_markers IS
  'Phase 3 W3.1 — per-user read marker for badge counts. Self-only RLS; users see their own markers, never another user`s.';

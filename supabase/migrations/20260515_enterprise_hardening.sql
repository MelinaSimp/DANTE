-- Enterprise hardening: watcher tokens with expiry + per-project access controls

-- 1. Add watcher_token + token_expires_at to watched_folders
ALTER TABLE watched_folders
  ADD COLUMN IF NOT EXISTS watcher_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_wf_watcher_token
  ON watched_folders (watcher_token) WHERE watcher_token IS NOT NULL;

-- Backfill existing active folders with a token so they can use the CLI
UPDATE watched_folders
SET watcher_token = encode(gen_random_bytes(32), 'hex')
WHERE watcher_token IS NULL AND status = 'active';

-- 2. Per-project access control
-- workspace_role on profiles: 'admin' sees everything, 'member' sees assigned projects
-- The existing 'role' column on profiles already exists with default 'member'.
-- We'll use it: admin = full access, member = project-scoped access.

CREATE TABLE IF NOT EXISTS vault_project_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES vault_projects(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor', 'admin')),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (project_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_vpa_profile ON vault_project_access (profile_id);
CREATE INDEX IF NOT EXISTS idx_vpa_project ON vault_project_access (project_id);

-- RLS: users can see their own access entries + admins see all
ALTER TABLE vault_project_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY vpa_select ON vault_project_access FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.workspace_id = (SELECT vp.workspace_id FROM vault_projects vp WHERE vp.id = vault_project_access.project_id)
        AND p.role IN ('admin', 'owner')
    )
  );

CREATE POLICY vpa_modify ON vault_project_access FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.workspace_id = (SELECT vp.workspace_id FROM vault_projects vp WHERE vp.id = vault_project_access.project_id)
        AND p.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.workspace_id = (SELECT vp.workspace_id FROM vault_projects vp WHERE vp.id = vault_project_access.project_id)
        AND p.role IN ('admin', 'owner')
    )
  );

-- Grant existing admins full access to all projects
INSERT INTO vault_project_access (project_id, profile_id, role)
SELECT vp.id, p.id, 'admin'
FROM vault_projects vp
CROSS JOIN profiles p
WHERE p.role = 'admin'
  AND p.workspace_id = vp.workspace_id
ON CONFLICT (project_id, profile_id) DO NOTHING;

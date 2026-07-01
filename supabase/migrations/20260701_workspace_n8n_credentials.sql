-- 20260701_workspace_n8n_credentials.sql
--
-- Per-workspace n8n credentials for multi-tenant isolation.
-- Each workspace gets its own driftCreApi credential in n8n (scoped to
-- that workspace's ID) instead of all workflows sharing one global
-- credential. The n8n public API cannot list credentials, so the
-- Drift side of the mapping lives here.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS n8n_credential_id TEXT;

COMMENT ON COLUMN workspaces.n8n_credential_id IS
  'ID of this workspace''s driftCreApi credential in n8n. Created lazily on first workflow push; NULL until then.';

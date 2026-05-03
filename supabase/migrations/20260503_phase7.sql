-- 20260503_phase7.sql
--
-- Phase 7 schema additions:
--   - api_tokens (public API namespace; token-based auth)
--   - examiner_credentials (time-bound read-only credentials for
--     regulators)
--
-- Companion code: lib/auth/api-token.ts and the /api/public/v1/*
-- routes, plus lib/auth/examiner.ts.

-- ── api_tokens ───────────────────────────────────────────────────
--
-- Workspace admins issue tokens for external integrations. Tokens
-- store a sha256 hash, never the plaintext. Scope is a free-form
-- bitmask (read:contacts, read:memory, read:vault, write:memory,
-- ...). Optional rate limit override.

CREATE TABLE IF NOT EXISTS api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,                          -- "Wealthbox sync", "internal cron"
  token_hash text NOT NULL UNIQUE,             -- sha256 of plaintext
  prefix text NOT NULL,                        -- first 8 chars of plaintext, for display
  scopes text[] NOT NULL DEFAULT '{}',
  rate_limit_per_min int,                      -- override of workspace default
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_active
  ON api_tokens (workspace_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_tokens_hash
  ON api_tokens (token_hash) WHERE revoked_at IS NULL;

ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS api_tokens_select ON api_tokens;
CREATE POLICY api_tokens_select ON api_tokens
  FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- ── examiner_credentials ─────────────────────────────────────────
--
-- Phase 7 W7.9. Workspace admin issues a credential to a regulator
-- for a defined date range. The credential is a magic-link URL the
-- examiner clicks through; their session sees only resources within
-- the granted scope (workspace-wide read-only OR contact-scoped
-- read-only). Auto-expires.

CREATE TABLE IF NOT EXISTS examiner_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  issued_by uuid REFERENCES auth.users(id),
  examiner_label text NOT NULL,                -- "SEC examiner — case 2026-XYZ"
  contact_id uuid REFERENCES contacts(id),     -- null = workspace-wide
  -- Time bounds.
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz NOT NULL,
  -- The credential itself.
  token_hash text NOT NULL UNIQUE,
  used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_examiner_credentials_active
  ON examiner_credentials (workspace_id, valid_until DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_examiner_credentials_token
  ON examiner_credentials (token_hash) WHERE revoked_at IS NULL;

ALTER TABLE examiner_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS examiner_credentials_select ON examiner_credentials;
CREATE POLICY examiner_credentials_select ON examiner_credentials
  FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE api_tokens IS
  'Phase 7 W7.1 — public API token store. Plaintext never persisted; lookup by sha256 hash.';
COMMENT ON TABLE examiner_credentials IS
  'Phase 7 W7.9 — time-bound, scope-limited read-only credentials for regulators.';

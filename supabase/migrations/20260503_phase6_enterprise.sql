-- 20260503_phase6_enterprise.sql
--
-- Phase 6 schema additions:
--   - workspace_branding (logos, colors, custom subdomain)
--   - workspace_firm_prompts (per-firm prompt customization, Phase 7)
--   - workspace_terminology (vertical-specific dictionary overrides)
--   - erasure_requests (right-to-erasure two-step flow)
--   - workspaces.legal_hold (e-discovery freeze)
--
-- All workspace-scoped, RLS-enabled. Enterprise-tier-gated by
-- application code (lib/billing/plan-tiers.ts).

-- ── Branding ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspace_branding (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  logo_storage_path text,        -- Supabase storage object path
  brand_color_hex text,          -- e.g. "#1a3a5c"
  custom_subdomain text UNIQUE,  -- e.g. "acme" → acme.driftai.studio
  email_from_name text,
  email_from_domain text,        -- requires DNS verification (separate flow)
  pdf_header_text text,          -- shown atop generated PDFs
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE workspace_branding ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS branding_select ON workspace_branding;
CREATE POLICY branding_select ON workspace_branding
  FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS branding_modify ON workspace_branding;
CREATE POLICY branding_modify ON workspace_branding
  FOR ALL
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- ── Per-firm prompt customization (Phase 7 W7.5) ─────────────────

CREATE TABLE IF NOT EXISTS workspace_firm_prompts (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  -- Free-form firm-specific instruction prepended to the system
  -- prompt at request time. Examples:
  --   "Always lead with the IPS quote when discussing portfolio policy."
  --   "Never use the word 'guaranteed' in any communication."
  --   "Address Mr. Aaronson as 'Aaron' — he prefers his first name."
  custom_instructions text,
  -- Audit-visible firm voice override. Limited to a few hundred
  -- chars to avoid prompt-bloat — the per-firm guidance should be
  -- distillable to a paragraph.
  -- updated_at + updated_by for compliance audit.
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE workspace_firm_prompts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS firm_prompts_select ON workspace_firm_prompts;
CREATE POLICY firm_prompts_select ON workspace_firm_prompts
  FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS firm_prompts_modify ON workspace_firm_prompts;
CREATE POLICY firm_prompts_modify ON workspace_firm_prompts
  FOR ALL
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- ── Terminology dictionary overrides (Phase 6 W6.12) ─────────────

CREATE TABLE IF NOT EXISTS workspace_terminology (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- The token the agent should recognize as a domain term
  -- (e.g. "Schwab", "WMA-2024-RECAP", "MLS-49382"). Indexed by
  -- prefix for retrieval lookups.
  term text NOT NULL,
  -- Plain-language explanation injected into the system prompt
  -- when the term appears in a query. Optional.
  definition text,
  -- Free-form scope tag — "ticker", "custodian", "transaction_type",
  -- "mls_code", etc. The agent loop reads these to decide which
  -- dictionary subset to inline.
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, term)
);

CREATE INDEX IF NOT EXISTS idx_workspace_terminology_term
  ON workspace_terminology (workspace_id, term);

ALTER TABLE workspace_terminology ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS terminology_select ON workspace_terminology;
CREATE POLICY terminology_select ON workspace_terminology
  FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS terminology_modify ON workspace_terminology;
CREATE POLICY terminology_modify ON workspace_terminology
  FOR ALL
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- ── Erasure requests (Phase 6 W6.6) ──────────────────────────────

CREATE TABLE IF NOT EXISTS erasure_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  initiated_by uuid REFERENCES auth.users(id),
  -- For user-scope: target user. For workspace-scope: NULL.
  target_user_id uuid,
  scope text NOT NULL CHECK (scope IN ('user', 'workspace')),
  confirmation_token text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'cancelled', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  certificate_hash text
);

CREATE INDEX IF NOT EXISTS idx_erasure_requests_pending
  ON erasure_requests (workspace_id, created_at DESC)
  WHERE status = 'pending';

-- ── Legal hold (Phase 7 W7.8) ────────────────────────────────────
--
-- A workspace under legal hold is excluded from the retention
-- worker. Set by superadmin or in response to litigation notice.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legal_hold_note text,
  ADD COLUMN IF NOT EXISTS legal_hold_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS legal_hold_set_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN workspaces.legal_hold IS
  'Phase 7 W7.8 — when true, retention worker skips this workspace regardless of policy. Set in response to litigation notice or examination.';

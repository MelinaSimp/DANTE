-- 20260502_panel_followup.sql
--
-- Schema work for the panel-followup batch: persist citation
-- reports on chat messages, formalize granular RBAC roles, wire a
-- workspace plan-tier enforcement column, and add the prompt
-- version + grounding score columns the agent run loop now writes.
--
-- Each section is independent — apply in order or skip individual
-- sections if your workspace doesn't yet have the parent table.

-- ── #2: Persist citation report on dante_chat_messages ───────────
--
-- The validator's report is computed on the streaming response and
-- shipped via SSE. Yesterday's threads currently render undecorated
-- because the report wasn't persisted. We store it on the assistant
-- message row alongside the trace.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'dante_chat_messages'
  ) THEN
    EXECUTE '
      ALTER TABLE dante_chat_messages
        ADD COLUMN IF NOT EXISTS citation_report jsonb,
        ADD COLUMN IF NOT EXISTS prompt_version text,
        ADD COLUMN IF NOT EXISTS grounding_score numeric(3,2);
    ';
  END IF;
END $$;

-- ── #9: Granular RBAC ────────────────────────────────────────────
--
-- profiles.role formalizes who can do what. Default 'advisor' so
-- existing rows behave the same. Workspace admin / superadmin
-- existing booleans are preserved; the role column adds:
--
--   admin       — workspace admin (manages settings, members, billing)
--   supervisor  — RIA principal / realtor designated broker.
--                 Can approve memory + outbound queue items.
--                 Required for client-facing autonomous send-offs.
--   advisor     — default. Full chat, can write memory (pending),
--                 view own contacts. Cannot approve.
--   read_only   — examiner / auditor / read-only stakeholder.
--                 Can view, cannot mutate, cannot send.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'advisor'
    CHECK (role IN ('admin', 'supervisor', 'advisor', 'read_only'));

-- Backfill: existing is_workspace_admin → role='admin'
UPDATE profiles
SET role = 'admin'
WHERE is_workspace_admin = true AND role = 'advisor';

CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON profiles (workspace_id, role);

COMMENT ON COLUMN profiles.role IS
  'RBAC role. Drives approval-queue routing + middleware gates. See lib/auth/rbac.ts.';

-- ── #11: Plan tier enforcement column ────────────────────────────
--
-- Plan tier on workspaces. Stripe SKU mapping flips this; route
-- middleware reads it for tier-gated features. Three tiers shipped
-- per ADR 0002: starter / pro / enterprise. Default 'starter'.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS plan_tier text NOT NULL DEFAULT 'starter'
    CHECK (plan_tier IN ('starter', 'pro', 'enterprise')),
  ADD COLUMN IF NOT EXISTS plan_seats int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS plan_renewed_at timestamptz;

COMMENT ON COLUMN workspaces.plan_tier IS
  'starter ($300) / pro ($800) / enterprise ($1500+). Drives feature gates in lib/billing/plan-tiers.ts.';

-- ── Memory category in retrieval (#5) — RPC update ───────────────
--
-- Add an optional `p_category` parameter that boosts hits whose
-- metadata.category matches. Used by the agent loop when the
-- query is category-shaped ("show me dealbreakers for the
-- Marlows"). Defaulting to NULL preserves current behavior for
-- callers that don't pass it.

CREATE OR REPLACE FUNCTION dante_memory_search(
  p_workspace_id uuid,
  p_query_embedding vector(1536),
  p_contact_id uuid DEFAULT NULL,
  p_kinds text[] DEFAULT NULL,
  p_limit int DEFAULT 8,
  p_include_pending boolean DEFAULT false,
  p_category text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  kind text,
  content text,
  subject_contact_id uuid,
  subject_type text,
  source_kind text,
  source_id uuid,
  confidence numeric,
  similarity float,
  created_at timestamptz,
  review_status text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id, m.workspace_id, m.kind, m.content,
    m.subject_contact_id, m.subject_type,
    m.source_kind, m.source_id, m.confidence,
    -- Vector similarity, with a +0.15 boost when category matches.
    -- Boost is small enough that a wildly more-similar hit on a
    -- different category still wins, large enough that two roughly-
    -- equal hits get tie-broken by category.
    CASE
      WHEN m.embedding IS NULL THEN 0::float
      ELSE
        (1 - (m.embedding <=> p_query_embedding))
        + CASE
            WHEN p_category IS NOT NULL
                 AND m.metadata->>'category' = p_category
            THEN 0.15
            ELSE 0
          END
    END AS similarity,
    m.created_at, m.review_status
  FROM dante_memory m
  WHERE m.workspace_id = p_workspace_id
    AND m.superseded_by IS NULL
    AND (m.expires_at IS NULL OR m.expires_at > now())
    AND (p_contact_id IS NULL OR m.subject_contact_id = p_contact_id)
    AND (p_kinds IS NULL OR m.kind = ANY(p_kinds))
    AND (m.deleted_at IS NULL)
    AND (
      m.review_status = 'approved'
      OR (p_include_pending AND m.review_status = 'pending')
    )
  ORDER BY similarity DESC,
           COALESCE(m.confidence, 0.5) DESC,
           m.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 25));
END;
$$ LANGUAGE plpgsql STABLE;

-- ── #3: Retention worker support ─────────────────────────────────
--
-- The worker needs a place to record runs (last_run_at, rows
-- deleted) so we can monitor it from superadmin and so a re-run
-- doesn't process the same rows twice.

CREATE TABLE IF NOT EXISTS retention_worker_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  workspaces_touched int NOT NULL DEFAULT 0,
  rows_deleted_contacts int NOT NULL DEFAULT 0,
  rows_deleted_documents int NOT NULL DEFAULT 0,
  rows_deleted_memories int NOT NULL DEFAULT 0,
  rows_deleted_conversations int NOT NULL DEFAULT 0,
  errors jsonb,
  triggered_by text NOT NULL DEFAULT 'cron'
    CHECK (triggered_by IN ('cron', 'manual', 'admin'))
);

CREATE INDEX IF NOT EXISTS idx_retention_runs_recent
  ON retention_worker_runs (started_at DESC);

COMMENT ON TABLE retention_worker_runs IS
  'Phase 3+ — audit trail for the retention worker. Each run records what was hard-deleted from each workspace per the policy table.';

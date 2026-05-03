-- 20260502_memory_review_queue.sql
--
-- Phase 1 W1.2 — AI memory review queue.
--
-- The agent's memory.write tool can persist facts learned from
-- conversation. Without supervision, a hallucinated fact ("client
-- mentioned wanting to liquidate Roth IRA" when they said "rotate")
-- becomes ground truth on the next retrieval and contaminates every
-- subsequent answer about that client. In a regulated context that's
-- a fiduciary issue.
--
-- This migration adds a three-state review pipeline:
--   pending   — AI-written, not yet reviewed. Default for memory.write.
--   approved  — Human-confirmed (or human-written from the start).
--   rejected  — Human-rejected. Kept for audit but excluded from search.
--
-- memory.search filters out `pending` and `rejected` rows by default,
-- so AI-written facts are NOT used in subsequent retrievals until an
-- advisor (or designated broker, for realtor workspaces) approves
-- them in the review queue UI.

-- 1. Status column. NOT NULL with default 'approved' so existing rows
--    (manually-written before this migration) stay searchable. The
--    application code defaults AI-written rows to 'pending' going
--    forward — the column default only catches direct INSERTs that
--    didn't specify a status.
ALTER TABLE dante_memory
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'approved'
    CHECK (review_status IN ('pending', 'approved', 'rejected'));

-- 2. Reviewer audit trail.
ALTER TABLE dante_memory
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

-- 3. Index for the review-queue view (workspace + pending + recency).
CREATE INDEX IF NOT EXISTS idx_dante_memory_review_pending
  ON dante_memory (workspace_id, created_at DESC)
  WHERE review_status = 'pending';

-- 4. Update the memory search RPC to exclude non-approved rows by
--    default. We add a parameter so the review-queue UI can opt in
--    to seeing pending rows. Existing callers (the agent loop) pass
--    the default and silently get only approved rows.
--
--    NOTE: this RPC may already exist with a similar shape. We do
--    CREATE OR REPLACE so reapplying is safe. If your rev of the RPC
--    has a different parameter list, reconcile manually before
--    applying — the body below assumes the columns above exist.

CREATE OR REPLACE FUNCTION dante_memory_search(
  p_workspace_id uuid,
  p_query_embedding vector(1536),
  p_contact_id uuid DEFAULT NULL,
  p_kinds text[] DEFAULT NULL,
  p_limit int DEFAULT 8,
  p_include_pending boolean DEFAULT false
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
    m.id,
    m.workspace_id,
    m.kind,
    m.content,
    m.subject_contact_id,
    m.subject_type,
    m.source_kind,
    m.source_id,
    m.confidence,
    CASE
      WHEN m.embedding IS NULL THEN 0::float
      ELSE 1 - (m.embedding <=> p_query_embedding)
    END AS similarity,
    m.created_at,
    m.review_status
  FROM dante_memory m
  WHERE m.workspace_id = p_workspace_id
    AND m.superseded_by IS NULL
    AND (m.expires_at IS NULL OR m.expires_at > now())
    AND (p_contact_id IS NULL OR m.subject_contact_id = p_contact_id)
    AND (p_kinds IS NULL OR m.kind = ANY(p_kinds))
    AND (
      m.review_status = 'approved'
      OR (p_include_pending AND m.review_status = 'pending')
    )
  ORDER BY
    CASE
      WHEN m.embedding IS NULL THEN 0::float
      ELSE 1 - (m.embedding <=> p_query_embedding)
    END DESC,
    COALESCE(m.confidence, 0.5) DESC,
    m.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 25));
END;
$$ LANGUAGE plpgsql STABLE;

-- 5. Comments — load-bearing context for the next engineer reading
--    pg_dump output trying to understand why these columns exist.
COMMENT ON COLUMN dante_memory.review_status IS
  'AI-written rows default to pending; require human approval before they appear in memory.search results.';
COMMENT ON COLUMN dante_memory.reviewed_by IS
  'auth.users.id of the reviewer who approved/rejected this memory.';
COMMENT ON COLUMN dante_memory.reviewed_at IS
  'When the review_status moved out of pending.';
COMMENT ON COLUMN dante_memory.review_note IS
  'Optional reviewer note ("approved with edit", "rejected: model hallucinated", etc.).';

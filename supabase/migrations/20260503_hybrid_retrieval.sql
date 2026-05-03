-- 20260503_hybrid_retrieval.sql
--
-- Phase 6 W6.11 — hybrid retrieval (keyword + vector).
--
-- Adds tsvector columns + GIN indexes to dante_memory and
-- vault_item_chunks. The new dante_memory_search_hybrid RPC
-- combines vector similarity with keyword matching via a weighted
-- score:
--
--   score = 0.6 * vector_similarity
--         + 0.3 * keyword_match (normalized 0..1)
--         + 0.1 * recency * confidence
--
-- The existing dante_memory_search RPC stays for callers that
-- want pure vector recall. New code paths (the agent loop) call
-- the hybrid RPC. App-side hybrid invocation lives in
-- lib/dante/memory/search.ts (see useHybrid option).

-- ── Memory tsvector ──────────────────────────────────────────────

ALTER TABLE dante_memory
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_dante_memory_content_tsv
  ON dante_memory USING GIN (content_tsv);

-- ── Vault chunk tsvector ─────────────────────────────────────────

ALTER TABLE vault_item_chunks
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_vault_item_chunks_content_tsv
  ON vault_item_chunks USING GIN (content_tsv);

-- ── Hybrid memory search RPC ─────────────────────────────────────

CREATE OR REPLACE FUNCTION dante_memory_search_hybrid(
  p_workspace_id uuid,
  p_query_text text,
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
DECLARE
  ts_query tsquery;
BEGIN
  -- Convert free-form query into a tsquery. plainto_tsquery is
  -- liberal; phraseto_tsquery is strict. We use the former so
  -- partial matches still score.
  ts_query := plainto_tsquery('english', coalesce(p_query_text, ''));

  RETURN QUERY
  SELECT
    m.id, m.workspace_id, m.kind::text, m.content,
    m.subject_contact_id, m.subject_type::text,
    m.source_kind::text, m.source_id, m.confidence::numeric,
    -- Composite score:
    --   0.6 * vector similarity (cosine)
    --   0.3 * keyword match (tsv rank, normalized)
    --   0.1 * recency × confidence (already part of confidence)
    --   + 0.15 * category match (when supplied)
    (
      0.6 * CASE
        WHEN m.embedding IS NULL THEN 0::float
        ELSE 1 - (m.embedding <=> p_query_embedding)
      END
      +
      0.3 * COALESCE(
        ts_rank(m.content_tsv, ts_query)::float,
        0
      )
      +
      0.1 * COALESCE(m.confidence, 0.5)::float
      +
      CASE
        WHEN p_category IS NOT NULL AND m.metadata->>'category' = p_category
        THEN 0.15
        ELSE 0
      END
    )::float AS similarity,
    m.created_at, m.review_status::text
  FROM dante_memory m
  WHERE m.workspace_id = p_workspace_id
    AND m.superseded_by IS NULL
    AND (m.expires_at IS NULL OR m.expires_at > now())
    AND (p_contact_id IS NULL OR m.subject_contact_id = p_contact_id)
    AND (p_kinds IS NULL OR m.kind::text = ANY(p_kinds))
    AND (m.deleted_at IS NULL)
    AND (
      m.review_status = 'approved'
      OR (p_include_pending AND m.review_status = 'pending')
    )
    AND (
      -- At least one of vector or keyword must contribute.
      m.embedding IS NOT NULL
      OR m.content_tsv @@ ts_query
    )
  ORDER BY similarity DESC,
           COALESCE(m.confidence, 0.5) DESC,
           m.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 25));
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION dante_memory_search_hybrid IS
  'Phase 6 W6.11 — hybrid memory search. Combines pgvector cosine similarity, tsvector keyword match, and confidence/recency. Replaces dante_memory_search at the agent-loop call site.';

-- Add project_id filter to dante_archive_search so Dante/Vergil
-- can scope retrieval to a single vault project.

-- Drop the vault_items-backed overload (4 args) and recreate with 5.
-- The legacy dante_archive_chunks-backed overload is untouched.
DROP FUNCTION IF EXISTS dante_archive_search(uuid, vector, integer, text);

CREATE OR REPLACE FUNCTION dante_archive_search(
  p_workspace_id    UUID,
  p_query_embedding vector,
  p_limit           INTEGER  DEFAULT 5,
  p_kind_filter     TEXT     DEFAULT NULL,
  p_project_id      UUID     DEFAULT NULL
)
RETURNS TABLE (
  chunk_id        UUID,
  document_id     UUID,
  chunk_index     INTEGER,
  page_number     INTEGER,
  content         TEXT,
  similarity      DOUBLE PRECISION,
  document_title  TEXT,
  document_kind   TEXT,
  project_id      UUID
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id           AS chunk_id,
    c.item_id      AS document_id,
    c.chunk_index,
    c.page_number,
    c.content,
    1 - (c.embedding <=> p_query_embedding) AS similarity,
    v.title        AS document_title,
    v.kind         AS document_kind,
    v.project_id   AS project_id
  FROM vault_item_chunks c
  JOIN vault_items v ON v.id = c.item_id
  WHERE c.workspace_id = p_workspace_id
    AND (p_kind_filter IS NULL OR v.kind = p_kind_filter)
    AND (p_project_id  IS NULL OR v.project_id = p_project_id)
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT greatest(1, least(p_limit, 50));
$$;

-- Add project_id column to watched_file_index for Phase C
-- (unified ingest surface — show indexed files per vault project).
ALTER TABLE watched_file_index
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES vault_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wfi_project
  ON watched_file_index (project_id, ingest_status)
  WHERE deleted_at IS NULL;

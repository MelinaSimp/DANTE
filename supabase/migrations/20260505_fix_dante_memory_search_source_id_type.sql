-- 20260505_fix_dante_memory_search_source_id_type.sql
--
-- The 6-arg and 7-arg overloads of dante_memory_search declared
-- source_id as uuid in their RETURNS TABLE, but dante_memory.source_id
-- is text. Postgres throws "structure of query does not match
-- function result type" on every call — every Dante chat turn
-- that hit memory.search broke silently in the agent trace.
--
-- The 5-arg overload is fine (source_id text). Drop the broken
-- two and recreate the 7-arg (which is what lib/dante/memory/search.ts
-- calls) with source_id text + an explicit ::text cast in the
-- SELECT to match.
--
-- Applied to prod 2026-05-05.

DROP FUNCTION IF EXISTS public.dante_memory_search(uuid, vector, uuid, text[], integer, boolean);
DROP FUNCTION IF EXISTS public.dante_memory_search(uuid, vector, uuid, text[], integer, boolean, text);

CREATE OR REPLACE FUNCTION public.dante_memory_search(
  p_workspace_id uuid,
  p_query_embedding vector,
  p_contact_id uuid DEFAULT NULL::uuid,
  p_kinds text[] DEFAULT NULL::text[],
  p_limit integer DEFAULT 8,
  p_include_pending boolean DEFAULT false,
  p_category text DEFAULT NULL::text
)
RETURNS TABLE(
  id uuid,
  workspace_id uuid,
  kind text,
  content text,
  subject_contact_id uuid,
  subject_type text,
  source_kind text,
  source_id text,
  confidence numeric,
  similarity double precision,
  created_at timestamp with time zone,
  review_status text
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id, m.workspace_id, m.kind::text, m.content,
    m.subject_contact_id, m.subject_type::text,
    m.source_kind::text, m.source_id::text, m.confidence::numeric,
    CASE
      WHEN m.embedding IS NULL THEN 0::float
      ELSE
        (1 - (m.embedding <=> p_query_embedding))
        + CASE
            WHEN p_category IS NOT NULL
                 AND m.metadata->>'category' = p_category
            THEN 0.15 ELSE 0
          END
    END AS similarity,
    m.created_at, m.review_status::text
  FROM dante_memory m
  WHERE m.workspace_id = p_workspace_id
    AND m.superseded_by IS NULL
    AND (m.expires_at IS NULL OR m.expires_at > now())
    AND (p_contact_id IS NULL OR m.subject_contact_id = p_contact_id)
    AND (p_kinds IS NULL OR m.kind::text = ANY(p_kinds))
    AND (m.deleted_at IS NULL)
    AND (m.review_status = 'approved'
         OR (p_include_pending AND m.review_status = 'pending'))
  ORDER BY similarity DESC,
           COALESCE(m.confidence, 0.5) DESC,
           m.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 8), 25));
END;
$$;

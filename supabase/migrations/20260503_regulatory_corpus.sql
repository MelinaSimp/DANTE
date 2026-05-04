-- 20260503_regulatory_corpus.sql
--
-- Phase C3 — shared regulatory corpus.
--
-- Two tables, separate from vault_items / vault_item_chunks:
--   • vault_items is per-workspace user docs with workspace-scoped
--     RLS. Conflating workspace docs with workspace-shared corpus
--     would mean nullable workspace_id, mixed RLS, and per-row
--     "is this mine or shared?" gymnastics.
--   • regulatory_corpus_* is workspace-shared. Anyone authenticated
--     can read; only service_role can write (ingest workers).
--
-- Dual-vertical from day one: every corpus item carries an
-- industry_scope text[] so realtor-side regs (HUD enforcement,
-- state real estate commission rulings, fair-housing case law)
-- slot in without schema changes. Default scope is both verticals
-- because most SEC enforcement actions discuss compliance posture
-- relevant to both fiduciary advisors and realtor brokerages.

CREATE TABLE IF NOT EXISTS regulatory_corpus_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authority    text NOT NULL,             -- 'SEC' | 'IRS' | 'DOL' | 'HUD' | 'FINRA' | 'NASAA' | 'FTC'
  source_kind  text NOT NULL,             -- 'litigation_release' | 'no_action_letter' | 'rev_ruling' | 'plr' | 'eo' | 'enforcement_action' | 'guidance' | 'rule'
  source_url   text NOT NULL UNIQUE,      -- canonical URL, dedup key
  title        text NOT NULL,
  body         text NOT NULL,
  published_at timestamptz,               -- when the authority published it
  industry_scope text[] NOT NULL DEFAULT ARRAY['financial_advisor', 'real_estate'],
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CHECK (authority IN ('SEC', 'IRS', 'DOL', 'HUD', 'FINRA', 'NASAA', 'FTC', 'STATE_RE', 'OTHER'))
);

CREATE INDEX IF NOT EXISTS regulatory_corpus_items_authority_idx
  ON regulatory_corpus_items (authority, published_at DESC);
CREATE INDEX IF NOT EXISTS regulatory_corpus_items_industry_idx
  ON regulatory_corpus_items USING GIN (industry_scope);

CREATE TABLE IF NOT EXISTS regulatory_corpus_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES regulatory_corpus_items(id) ON DELETE CASCADE,
  ord         int NOT NULL,
  content     text NOT NULL,
  embedding   vector(1536),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS regulatory_corpus_chunks_item_idx
  ON regulatory_corpus_chunks (item_id, ord);
CREATE INDEX IF NOT EXISTS regulatory_corpus_chunks_embedding_idx
  ON regulatory_corpus_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- RLS — read open to all authenticated users (workspace-shared by
-- design); writes only via service_role (ingest workers).
ALTER TABLE regulatory_corpus_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_corpus_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS regulatory_corpus_items_read ON regulatory_corpus_items;
CREATE POLICY regulatory_corpus_items_read ON regulatory_corpus_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS regulatory_corpus_chunks_read ON regulatory_corpus_chunks;
CREATE POLICY regulatory_corpus_chunks_read ON regulatory_corpus_chunks
  FOR SELECT TO authenticated USING (true);

-- Updated_at trigger.
CREATE OR REPLACE FUNCTION regulatory_corpus_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_regulatory_corpus_items_updated_at
  ON regulatory_corpus_items;
CREATE TRIGGER trg_regulatory_corpus_items_updated_at
  BEFORE UPDATE ON regulatory_corpus_items
  FOR EACH ROW EXECUTE FUNCTION regulatory_corpus_set_updated_at();

-- Vector search RPC — workspace-agnostic by design. The caller
-- passes industry filters from the workspace's industry config; the
-- function returns top-k chunks with item metadata joined for
-- citation rendering. Cosine similarity, threshold defaults to 0
-- (caller can tighten).
CREATE OR REPLACE FUNCTION regulatory_corpus_search(
  p_query_embedding vector(1536),
  p_industry text DEFAULT NULL,           -- 'financial_advisor' | 'real_estate' | NULL for both
  p_limit int DEFAULT 5,
  p_min_similarity float DEFAULT 0.0
)
RETURNS TABLE (
  item_id      uuid,
  chunk_id     uuid,
  authority    text,
  source_kind  text,
  source_url   text,
  title        text,
  ord          int,
  content      text,
  similarity   float,
  published_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id AS item_id,
    c.id AS chunk_id,
    i.authority,
    i.source_kind,
    i.source_url,
    i.title,
    c.ord,
    c.content,
    1 - (c.embedding <=> p_query_embedding) AS similarity,
    i.published_at
  FROM regulatory_corpus_chunks c
  JOIN regulatory_corpus_items  i ON i.id = c.item_id
  WHERE c.embedding IS NOT NULL
    AND (p_industry IS NULL OR i.industry_scope @> ARRAY[p_industry])
    AND (1 - (c.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY c.embedding <=> p_query_embedding ASC
  LIMIT GREATEST(1, LEAST(p_limit, 25));
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON TABLE regulatory_corpus_items IS
  'Workspace-shared regulatory corpus. SEC litigation releases, IRS PLRs, DOL ERISA opinions, HUD fair-housing enforcement, etc. Read-open to authenticated; writes via service_role only (ingest workers).';
COMMENT ON COLUMN regulatory_corpus_items.industry_scope IS
  'Which verticals this item is relevant to. Default is both. Realtor-only items (e.g. HUD fair-housing) set to {real_estate}; advisor-only items (FINRA OBA guidance) to {financial_advisor}.';
COMMENT ON FUNCTION regulatory_corpus_search IS
  'Vector search across the regulatory corpus. Pass workspace.industry to scope; pass NULL to retrieve from both verticals (rare — used only by superadmin tooling).';

-- Reference library — authoritative primary sources the AI cites when it
-- gives regulatory, tax, or compliance guidance. This is the RIA-side
-- analogue to Harvey's "named legal integrations": IRS Publications,
-- FINRA rule notices, SEC rules, SSA COLA notices, and so on.
--
-- The critical property of this table is that rows are *workspace-free*
-- — every advisor gets the same IRS Pub 590-B, there's no multi-tenant
-- isolation concern on the reference corpus itself. Each workspace's
-- private documents stay in client_documents (already scoped).
--
-- Two tables:
--
--   reference_sources: one row per canonical source. IRS Pub 590-B for
--     tax year 2025 is one row. If the 2026 edition comes out and the
--     tables shift, we add a new row rather than mutating — so a
--     citation from February still resolves to the bytes the model saw.
--
--   reference_chunks: chunked text with offsets back to the source PDF
--     page + character range. Embeddings live on this table so the
--     retrieval layer can rank chunks by semantic similarity.
--
-- No pgvector yet — embeddings are stored as jsonb float[] for now.
-- When traffic justifies it we'll migrate to pgvector and add an index.

create table if not exists reference_sources (
  id uuid primary key default gen_random_uuid(),
  -- Short stable key, e.g. 'irs-pub-590b-2025', 'finra-2210', 'sec-reg-bi'.
  -- This is what the AI cites. Never mutated after insert.
  source_key text not null unique,
  -- Human title, e.g. "IRS Publication 590-B — Distributions from IRAs"
  title text not null,
  -- Publishing authority, e.g. "IRS", "FINRA", "SEC", "SSA"
  authority text not null,
  -- Original URL where the document was fetched from
  source_url text not null,
  -- Tax year or effective year when applicable (null for perennial docs)
  effective_year int,
  -- SHA-256 of the full downloaded document bytes. If the source changes,
  -- the hash changes, and we know to re-ingest rather than trust a stale
  -- cite.
  content_hash text not null,
  -- Full plaintext content extracted from the PDF/HTML. Stored so we can
  -- rebuild chunks without re-fetching.
  content text not null,
  -- When we last verified the upstream URL still resolves to the same hash
  last_verified_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_reference_sources_authority
  on reference_sources (authority);

create table if not exists reference_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references reference_sources(id) on delete cascade,
  -- Sequential chunk index within the source (0..N). Lets us show
  -- "chunk 47 of Pub 590-B" in the citation UI.
  chunk_index int not null,
  -- The chunk text itself (typically 400–1000 chars).
  content text not null,
  -- Page number (1-indexed) the chunk started on, if the source is paged.
  source_page int,
  -- Character offset in the full content text where this chunk begins.
  -- Combined with length(content), lets us deep-link back to the exact
  -- span in the full document.
  char_offset int not null,
  -- Embedding vector as a plain float array. Dimension depends on the
  -- model; we store it so the retrieval layer can compute cosine on read.
  -- Switch to pgvector once we hit volume.
  embedding jsonb,
  -- Which embedding model produced the vector. Re-ingesting with a new
  -- model inserts new rows rather than mutating, so old references
  -- still work.
  embedding_model text,
  created_at timestamptz default now(),
  unique (source_id, chunk_index, embedding_model)
);

create index if not exists idx_reference_chunks_source
  on reference_chunks (source_id);

-- RLS: reference data is public to all authenticated users in the app.
-- No workspace scoping. Writes happen via service role only.
alter table reference_sources enable row level security;
alter table reference_chunks enable row level security;

create policy "Authenticated users can read reference sources"
  on reference_sources for select
  to authenticated
  using (true);

create policy "Authenticated users can read reference chunks"
  on reference_chunks for select
  to authenticated
  using (true);

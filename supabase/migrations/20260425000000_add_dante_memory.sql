-- Dante memory — persistent per-workspace knowledge store.
--
-- Three classes of memory live in one table:
--   fact     — atomic, structured-ish facts ("wife is named Sarah").
--              Queried by subject filter; embedding optional (short
--              facts match better structurally).
--   summary  — rolled-up notes ("last 90 days with this contact").
--              Always embedded; refreshed on a cadence.
--   episode  — raw transcript chunk, email body, meeting notes.
--              Always embedded; the substrate everything else is
--              distilled from.
--
-- Why one table and not three: the agent loop (Phase 1, see
-- docs/PHASE-1-DESIGN.md §2) needs ONE retrieval call that mixes
-- "what do you know about this contact" (fact + summary) with
-- "what was said" (episode). Joining three tables every retrieval
-- is worse than `where kind = any(...)`. Lifecycle is identical
-- across kinds (supersession, confidence decay, source-cascade).
--
-- This mirrors the dante_archive pattern (one table for all kinds
-- of source documents) deliberately — keeps the retrieval helper
-- contract symmetric.

create extension if not exists vector;

create table if not exists dante_memory (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind text not null check (kind in ('fact','summary','episode')),

  -- What this memory is about. Both nullable: workspace-level facts
  -- (e.g. "the firm's policy on gifts > $100") have no contact, and
  -- subject_type lets us extend to deals/accounts later without a
  -- schema change.
  subject_contact_id uuid references contacts(id) on delete cascade,
  subject_type text,

  -- Provenance. Lets us delete every memory derived from a given
  -- email/call/meeting in one query (source-cascade), retry
  -- extraction on a single source, and audit "where did this come
  -- from" in the UI.
  source_kind text,                                 -- 'email','call','meeting','manual','workflow'
  source_id text,                                   -- foreign id; type-tagged in app code

  content text not null,                            -- the human-readable memory
  embedding vector(1536),                           -- nullable; short facts may skip

  -- Lifecycle.
  --   confidence drops on a nightly decay (see §1 of the design doc)
  --   and is bumped back to 1.0 on reinforcement.
  --   expires_at lets short-lived memories auto-prune.
  --   superseded_by points at a newer memory that replaces this one;
  --   retrieval skips superseded rows but they stay for audit.
  confidence real not null default 1.0,
  expires_at timestamptz,
  superseded_by uuid references dante_memory(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Subject-scoped lookups: "what do we know about contact X" — the
-- single most common access pattern from the agent node. Partial
-- index on superseded_by IS NULL keeps the index small (we never
-- want to show stale rows).
create index if not exists dante_memory_workspace_subject_idx
  on dante_memory(workspace_id, subject_contact_id)
  where superseded_by is null;

-- Kind-scoped lookups, for "give me all summaries for this workspace
-- in the last 30 days" style queries from briefs/cron.
create index if not exists dante_memory_workspace_kind_idx
  on dante_memory(workspace_id, kind, created_at desc)
  where superseded_by is null;

-- Source-cascade index: when a customer_email row is deleted, we
-- need to wipe its derived memories quickly.
create index if not exists dante_memory_source_idx
  on dante_memory(workspace_id, source_kind, source_id);

-- Vector index for episode/summary similarity search. ivfflat with
-- 100 lists is the same setting we use elsewhere; revisit when
-- per-workspace memory size crosses ~100k rows.
create index if not exists dante_memory_embedding_idx
  on dante_memory using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Bump updated_at on UPDATE so confidence-decay and supersession
-- writes get a fresh timestamp without app-code churn.
create or replace function dante_memory_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists dante_memory_touch on dante_memory;
create trigger dante_memory_touch
  before update on dante_memory
  for each row execute function dante_memory_touch_updated_at();

-- RLS: mirror dante_briefs — authenticated users read their own
-- workspace; all writes go through the service-role client. The
-- agent runner lives server-side and uses supabaseAdmin, so this
-- is correct.
alter table dante_memory enable row level security;

drop policy if exists "dante_memory read own workspace" on dante_memory;
create policy "dante_memory read own workspace"
  on dante_memory for select
  to authenticated
  using (
    workspace_id in (
      select workspace_id from profiles where id = auth.uid()
    )
  );

-- Hybrid retrieval RPC. Caller passes:
--   p_workspace_id    — required, RLS-bypassing scope guard
--   p_query_embedding — required for vector ranking; pass a zero
--                       vector to fall back to recency × confidence
--   p_contact_id      — optional subject filter
--   p_kinds           — optional kind filter, e.g. '{fact,summary}'
--   p_limit           — top-K cap (1..25)
--
-- Returns rows with a `similarity` column (cosine; 0 when the row
-- has no embedding). Skips superseded and expired rows.
create or replace function dante_memory_search(
  p_workspace_id uuid,
  p_query_embedding vector(1536),
  p_contact_id uuid default null,
  p_kinds text[] default null,
  p_limit integer default 8
)
returns table (
  id uuid,
  kind text,
  content text,
  subject_contact_id uuid,
  source_kind text,
  source_id text,
  confidence real,
  created_at timestamptz,
  similarity real
)
language plpgsql
stable
as $$
begin
  return query
  select
    m.id,
    m.kind,
    m.content,
    m.subject_contact_id,
    m.source_kind,
    m.source_id,
    m.confidence,
    m.created_at,
    case
      when m.embedding is null then 0::real
      else (1 - (m.embedding <=> p_query_embedding))::real
    end as similarity
  from dante_memory m
  where m.workspace_id = p_workspace_id
    and m.superseded_by is null
    and (m.expires_at is null or m.expires_at > now())
    and (p_contact_id is null or m.subject_contact_id = p_contact_id)
    and (p_kinds is null or m.kind = any(p_kinds))
  order by
    -- Embedded rows: rank by similarity * confidence.
    -- Non-embedded: fall back to recency * confidence.
    case
      when m.embedding is null then 0
      else (1 - (m.embedding <=> p_query_embedding)) * m.confidence
    end desc,
    m.created_at desc
  limit greatest(1, least(coalesce(p_limit, 8), 25));
end;
$$;

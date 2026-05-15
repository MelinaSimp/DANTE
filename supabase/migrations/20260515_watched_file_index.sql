-- 20260515_watched_file_index.sql
--
-- Two-tier file indexing for enterprise-scale watched folders.
--
-- Tier 1: Lightweight metadata index (watched_file_index). The
-- watcher crawls a file server and sends only filenames, paths,
-- sizes, hashes — no file content. Covers 100% of files instantly.
-- Postgres full-text search on filename/path lets Dante search
-- across hundreds of thousands of files.
--
-- Tier 2: On-demand content ingest (content_requests). When Dante
-- or a user needs a file's contents, the server creates a content
-- request. The watcher polls for these, extracts text locally, and
-- uploads it. The file then flows through the existing vault
-- ingest pipeline (chunk → embed → store).

-- ── watched_file_index ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS watched_file_index (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id         UUID NOT NULL REFERENCES watched_folders(id) ON DELETE CASCADE,
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  file_path         TEXT NOT NULL,
  file_name         TEXT NOT NULL,
  file_extension    TEXT,
  file_size_bytes   BIGINT,
  content_sha256    TEXT,
  file_modified_at  TIMESTAMPTZ,

  search_tsv        TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(file_name, '')), 'A') ||
    setweight(to_tsvector('english', regexp_replace(coalesce(file_path, ''), '[/\\.]', ' ', 'g')), 'B')
  ) STORED,

  ingest_status     TEXT NOT NULL DEFAULT 'indexed'
                      CHECK (ingest_status IN (
                        'indexed',
                        'ingest_requested',
                        'ingesting',
                        'ingested',
                        'ingest_failed'
                      )),
  vault_item_id     UUID REFERENCES vault_items(id) ON DELETE SET NULL,
  ingest_error      TEXT,
  ingested_at       TIMESTAMPTZ,

  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,

  UNIQUE (folder_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_wfi_search
  ON watched_file_index USING GIN (search_tsv);

CREATE INDEX IF NOT EXISTS idx_wfi_workspace
  ON watched_file_index (workspace_id, ingest_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_wfi_folder
  ON watched_file_index (folder_id, last_seen_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_wfi_sha
  ON watched_file_index (workspace_id, content_sha256)
  WHERE content_sha256 IS NOT NULL;

ALTER TABLE watched_file_index ENABLE ROW LEVEL SECURITY;

CREATE POLICY wfi_select ON watched_file_index
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY wfi_modify ON watched_file_index
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- ── content_requests ─────────────────────────────────────────────
--
-- Reverse-push mechanism. The server creates a row here when it
-- needs file content; the watcher polls for pending rows, extracts
-- text locally, and POSTs it back via /fulfill.

CREATE TABLE IF NOT EXISTS content_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  folder_id       UUID NOT NULL REFERENCES watched_folders(id) ON DELETE CASCADE,
  index_entry_id  UUID NOT NULL REFERENCES watched_file_index(id) ON DELETE CASCADE,
  file_path       TEXT NOT NULL,

  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN (
                      'pending', 'claimed', 'completed', 'failed', 'expired'
                    )),
  requested_by    TEXT,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '5 minutes'),
  error           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cr_pending
  ON content_requests (folder_id, status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_cr_index_entry
  ON content_requests (index_entry_id);

ALTER TABLE content_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY cr_select ON content_requests
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY cr_modify ON content_requests
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- ── index_mode on watched_folders ────────────────────────────────
--
-- index_only: metadata crawl only, ingest on demand (for large servers)
-- auto_ingest: current behavior — extract + ingest everything

ALTER TABLE watched_folders
  ADD COLUMN IF NOT EXISTS index_mode TEXT NOT NULL DEFAULT 'auto_ingest'
    CHECK (index_mode IN ('index_only', 'auto_ingest'));

-- ── Backfill function ────────────────────────────────────────────
--
-- Copies existing confirmed watched_folder_files into the new index
-- table with ingest_status='ingested'. Run once after migration.

CREATE OR REPLACE FUNCTION backfill_watched_file_index()
RETURNS INT AS $$
DECLARE
  cnt INT;
BEGIN
  INSERT INTO watched_file_index (
    folder_id, workspace_id, file_path, file_name,
    file_extension, file_size_bytes, content_sha256,
    ingest_status, vault_item_id, ingested_at,
    first_seen_at, last_seen_at
  )
  SELECT
    wff.folder_id,
    wff.workspace_id,
    wff.file_path,
    wff.file_name,
    wff.file_extension,
    wff.file_size_bytes,
    wff.content_sha256,
    CASE WHEN wff.vault_item_id IS NOT NULL THEN 'ingested' ELSE 'indexed' END,
    wff.vault_item_id,
    CASE WHEN wff.vault_item_id IS NOT NULL THEN wff.confirmed_at END,
    wff.created_at,
    wff.created_at
  FROM watched_folder_files wff
  WHERE wff.status IN ('accepted', 'pending_user_confirm')
  ON CONFLICT (folder_id, file_path) DO UPDATE SET
    vault_item_id = EXCLUDED.vault_item_id,
    ingest_status = EXCLUDED.ingest_status,
    ingested_at = EXCLUDED.ingested_at,
    last_seen_at = now();

  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN cnt;
END;
$$ LANGUAGE plpgsql;

SELECT backfill_watched_file_index();

-- 20260502_soft_deletes_and_versioning.sql
--
-- Phase 2 W2.3 — Soft deletes + document versioning.
--
-- Two compliance gaps closed:
--
-- (1) Hard deletes on contacts / documents / memories conflict with
--     SEC Rule 17a-4 (RIA recordkeeping; ≥5y for communications) and
--     state real-estate transaction file retention (3-7y post-close).
--     We add deleted_at and switch the app to soft-delete by default.
--     A separate retention worker handles permissible hard deletion.
--
-- (2) The vault has no version history. Replacing IPS v1 with IPS v2
--     orphans every existing citation — the page numbers may now
--     point to different content. We introduce dante_archive_versions
--     and bind future citations to (document_id, version) rather than
--     just document_id.
--
-- Both verticals are affected equally; this is shared-core work.

-- ── Soft deletes ─────────────────────────────────────────────────

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

ALTER TABLE dante_archive_documents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

ALTER TABLE dante_memory
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

-- Conversations may not exist in every workspace (schema is feature-
-- gated); guard. Audit logs are append-only by policy and don't get
-- the column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'conversations'
  ) THEN
    EXECUTE 'ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
      ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id)';
  END IF;
END $$;

-- Partial indexes so default queries (deleted_at IS NULL) stay cheap.
CREATE INDEX IF NOT EXISTS idx_contacts_active
  ON contacts (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_archive_docs_active
  ON dante_archive_documents (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dante_memory_active
  ON dante_memory (workspace_id) WHERE deleted_at IS NULL;

-- ── Retention policy ─────────────────────────────────────────────
--
-- Per-workspace policy table. Defaults applied at workspace creation
-- per industry (RIA: 7yr communications, 5yr documents; Realtor:
-- 5yr post-close). Policy can be tightened (never weakened below
-- the per-vertical statutory minimum — enforced in app code, not SQL).

CREATE TABLE IF NOT EXISTS workspace_retention_policies (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,

  -- How long after deleted_at to retain soft-deleted rows before
  -- hard-deletion is permitted. Stored as days for simple cron math.
  contacts_retention_days int NOT NULL DEFAULT 2555,         -- 7 years
  documents_retention_days int NOT NULL DEFAULT 2555,        -- 7 years
  memories_retention_days int NOT NULL DEFAULT 2555,         -- 7 years
  conversations_retention_days int NOT NULL DEFAULT 2555,    -- 7 years

  -- Hard-delete enabled? When false, the retention worker still
  -- never runs — useful for workspaces under active examination.
  hard_delete_enabled boolean NOT NULL DEFAULT true,

  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE workspace_retention_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retention_select ON workspace_retention_policies;
CREATE POLICY retention_select ON workspace_retention_policies
  FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- ── Document versioning ──────────────────────────────────────────
--
-- Today: dante_archive_documents holds (id, title, kind, ..., status).
-- We keep that as the "logical document" identity and add
-- dante_archive_versions for the immutable file/text history.
-- Chunks gain a version_id pointer; the search RPC picks the latest
-- version by default; vault.cite citations capture the version id at
-- emit time so old citations stay resolvable.

CREATE TABLE IF NOT EXISTS dante_archive_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES dante_archive_documents(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  version int NOT NULL,                              -- 1, 2, 3...
  storage_path text NOT NULL,                        -- where the bytes live
  page_count int,
  byte_size bigint,
  mime_type text,

  -- When this version became the current one and (if superseded)
  -- when it stopped being current. NULL valid_to means "current."
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,

  uploaded_by uuid REFERENCES auth.users(id),
  upload_note text,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (document_id, version)
);

CREATE INDEX IF NOT EXISTS idx_archive_versions_current
  ON dante_archive_versions (document_id) WHERE valid_to IS NULL;

-- Add version pointer to chunks so a citation captures (document_id,
-- version_id) and survives subsequent re-uploads. Existing rows
-- (pre-versioning) get NULL until backfilled.
ALTER TABLE dante_archive_chunks
  ADD COLUMN IF NOT EXISTS version_id uuid REFERENCES dante_archive_versions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_archive_chunks_version
  ON dante_archive_chunks (version_id) WHERE version_id IS NOT NULL;

ALTER TABLE dante_archive_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS archive_versions_select ON dante_archive_versions;
CREATE POLICY archive_versions_select ON dante_archive_versions
  FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE dante_archive_versions IS
  'Phase 2 W2.3 — version history for vault documents. Citations bind to (document_id, version_id) so re-uploads do not orphan existing references.';
COMMENT ON COLUMN dante_archive_chunks.version_id IS
  'Which version of the parent document this chunk belongs to. NULL for legacy rows pre-versioning; new chunks always set this.';

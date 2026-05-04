-- 20260503_processing_modes_and_watched_folders.sql
--
-- Hermes integration, Phase 1 schema. Two coupled features:
--
--   1. Processing modes — per-workspace / per-contact / per-doc /
--      per-chat overrides controlling whether content gets
--      processed via cloud LLM (OpenAI by default) or local-only
--      (NousResearch Hermes via Ollama in the Electron app). Per
--      the panel synthesis: the threat model is "compromised Drift
--      infrastructure," and local-only is the architectural answer
--      because it bypasses Drift servers entirely. Audit log gets
--      a record that "this happened locally" but no content.
--
--   2. Watched folders — registered local-filesystem folders (via
--      the Electron app) or cloud-folder providers (OneDrive,
--      Google Drive, Dropbox in Phase 3) that auto-ingest into
--      Vault. Per-file audit trail for the SEC-inquiry answer:
--      "exactly which files did Drift index?"
--
-- Both are foundational schemas. The Electron-side runtime that
-- consumes them (Phase 2) is a separate sprint. Web-app surfaces
-- read these tables today so settings can be configured ahead of
-- the Electron rollout.

-- ── Processing mode hierarchy ─────────────────────────────────────
--
-- Resolution: workspace default → contact override → doc override
-- → chat override. Most restrictive wins (local_only beats cloud).

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS default_processing_mode TEXT NOT NULL DEFAULT 'cloud'
    CHECK (default_processing_mode IN ('cloud', 'local_only'));

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS processing_mode_override TEXT
    CHECK (processing_mode_override IS NULL
           OR processing_mode_override IN ('cloud', 'local_only'));

ALTER TABLE vault_items
  ADD COLUMN IF NOT EXISTS processing_mode_override TEXT
    CHECK (processing_mode_override IS NULL
           OR processing_mode_override IN ('cloud', 'local_only'));

ALTER TABLE dante_chats
  ADD COLUMN IF NOT EXISTS processing_mode TEXT
    CHECK (processing_mode IS NULL
           OR processing_mode IN ('cloud', 'local_only'));

COMMENT ON COLUMN workspaces.default_processing_mode IS
  'Phase-1 Hermes integration. Workspace-wide default. Most firms stay on cloud; CCO can flip to local_only firmwide for the strictest privacy posture (requires the Electron app + Ollama installed on every advisor laptop). Per-contact / per-doc / per-chat overrides can tighten further but never loosen below local_only.';
COMMENT ON COLUMN contacts.processing_mode_override IS
  'Optional override of the workspace default for THIS contact. Use when one client (e.g., a high-net-worth household with sensitive estate work) requires stricter handling than the firm''s default.';
COMMENT ON COLUMN vault_items.processing_mode_override IS
  'Optional override for THIS document. Sealed PI, divorce filings, tax returns — set local_only on upload to ensure the chunks never embed against a cloud provider.';
COMMENT ON COLUMN dante_chats.processing_mode IS
  'Optional override for THIS chat thread. User toggles this in the Ask composer; sticky for the chat. Use when a single thread touches sensitive material even though the surrounding workspace is cloud-mode.';

-- ── Watched folders ───────────────────────────────────────────────
--
-- The Electron app registers local folders here when the user
-- explicitly picks them. Cloud providers (OneDrive/GDrive/Dropbox)
-- in Phase 3 use the same table with kind != 'local_electron'.

CREATE TABLE IF NOT EXISTS watched_folders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Source provider. local_electron = Electron app on a specific
  -- device; rest are cloud providers added in Phase 3.
  kind            TEXT NOT NULL DEFAULT 'local_electron'
                       CHECK (kind IN ('local_electron', 'onedrive', 'google_drive', 'dropbox')),

  -- For kind='local_electron': stable per-device identifier the
  -- Electron app generates on first run and persists locally
  -- (machine-id + workspace-id hash). Same physical machine = same
  -- device_id across reboots. Different machines = different rows
  -- even if the user picks the same folder path.
  device_id       TEXT,
  device_label    TEXT,                                    -- e.g. "Loretta's MacBook Pro"

  -- For kind='local_electron': absolute folder path on the device.
  -- For cloud providers: the provider-specific folder identifier.
  folder_path     TEXT NOT NULL,
  folder_label    TEXT,                                    -- friendly name shown in the UI

  -- File-type filter. Defaults to the audit-clean set; CCO can
  -- tighten further. Server validates uploads against this on
  -- every notify call.
  allowed_extensions TEXT[] NOT NULL DEFAULT ARRAY['pdf', 'docx', 'xlsx', 'txt', 'md', 'rtf'],

  -- Files pulled from this folder default into this Vault project.
  -- One Vault project per watched folder is the clean mental model.
  default_vault_project_id UUID REFERENCES vault_projects(id) ON DELETE SET NULL,

  -- Default processing mode for files ingested from this folder.
  -- "Sensitive client folder" → set local_only and every doc that
  -- arrives is flagged on insert.
  default_processing_mode TEXT NOT NULL DEFAULT 'cloud'
                                CHECK (default_processing_mode IN ('cloud', 'local_only')),

  -- Operational state.
  status          TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'paused', 'deleted')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  paused_at       TIMESTAMPTZ,
  last_seen_at    TIMESTAMPTZ,                             -- last time the watcher checked in
  files_indexed_count INT NOT NULL DEFAULT 0,

  -- A user can register the same folder on the same device only
  -- once. Different devices register separately.
  UNIQUE (workspace_id, device_id, folder_path)
);

CREATE INDEX IF NOT EXISTS watched_folders_workspace_idx
  ON watched_folders (workspace_id, status);
CREATE INDEX IF NOT EXISTS watched_folders_device_idx
  ON watched_folders (device_id, workspace_id) WHERE status = 'active';

ALTER TABLE watched_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS watched_folders_select ON watched_folders;
CREATE POLICY watched_folders_select ON watched_folders
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS watched_folders_modify ON watched_folders;
CREATE POLICY watched_folders_modify ON watched_folders
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- ── Watched folder files (audit trail) ────────────────────────────
--
-- Every file the Electron app reports to the watched-folders API
-- creates a row here. Even if the file gets dedup-rejected (sha
-- already in the workspace) or extension-rejected, we log the
-- attempt with the rejection reason. The "what files did Drift
-- index?" answer to an examiner reads from this table.

CREATE TABLE IF NOT EXISTS watched_folder_files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id       UUID NOT NULL REFERENCES watched_folders(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- The local path the file was at when ingested. Useful for the
  -- "where did this come from?" answer; sensitive (reveals folder
  -- structure on the user's device) so RLS-protected.
  file_path       TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  file_extension  TEXT,
  file_size_bytes BIGINT,
  -- sha256 of the file content. Used for dedup and for tamper
  -- detection ("was the file the same when re-ingested?"). Hex
  -- string, 64 chars.
  content_sha256  TEXT,
  -- The vault_items.id this file was registered as, when accepted.
  -- Null when rejected.
  vault_item_id   UUID REFERENCES vault_items(id) ON DELETE SET NULL,
  -- Outcome of the ingest attempt.
  status          TEXT NOT NULL DEFAULT 'accepted'
                       CHECK (status IN ('accepted', 'rejected_extension', 'rejected_duplicate', 'rejected_size', 'rejected_other', 'pending_user_confirm')),
  rejected_reason TEXT,
  -- When the user confirmed the upload (per-file confirmation
  -- toast). Null when the workspace policy is "auto-accept" or for
  -- cloud providers where there is no per-file confirm.
  confirmed_at    TIMESTAMPTZ,
  confirmed_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS watched_folder_files_folder_idx
  ON watched_folder_files (folder_id, created_at DESC);
CREATE INDEX IF NOT EXISTS watched_folder_files_workspace_idx
  ON watched_folder_files (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS watched_folder_files_sha_idx
  ON watched_folder_files (workspace_id, content_sha256)
  WHERE content_sha256 IS NOT NULL;

ALTER TABLE watched_folder_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS watched_folder_files_select ON watched_folder_files;
CREATE POLICY watched_folder_files_select ON watched_folder_files
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- updated_at triggers.
CREATE OR REPLACE FUNCTION watched_folders_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_watched_folders_updated_at ON watched_folders;
CREATE TRIGGER trg_watched_folders_updated_at
  BEFORE UPDATE ON watched_folders
  FOR EACH ROW EXECUTE FUNCTION watched_folders_set_updated_at();

COMMENT ON TABLE watched_folders IS
  'Phase-1 Hermes integration. Folders the Electron app (or cloud provider) is watching for ingest into Vault. One row per (workspace, device, folder_path).';
COMMENT ON TABLE watched_folder_files IS
  'Phase-1 Hermes integration. Audit trail of every file the Electron app or cloud provider attempted to ingest from a watched folder, including rejected attempts. The "what did Drift index?" SEC-inquiry answer reads from here.';

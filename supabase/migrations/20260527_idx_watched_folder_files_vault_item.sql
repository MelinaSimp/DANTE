-- 20260527_idx_watched_folder_files_vault_item.sql
--
-- The SET NULL FK from watched_folder_files.vault_item_id to
-- vault_items.id had no supporting index. With 300K+ rows,
-- every vault_item delete triggered a sequential scan of
-- watched_folder_files, causing workspace-deletion timeouts.
--
-- This index was already applied to production via
-- CREATE INDEX CONCURRENTLY on 2026-05-27.

CREATE INDEX IF NOT EXISTS idx_watched_folder_files_vault_item_id
  ON watched_folder_files (vault_item_id);

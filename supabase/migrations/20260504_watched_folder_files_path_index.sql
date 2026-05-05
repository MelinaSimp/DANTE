-- 20260504_watched_folder_files_path_index.sql
--
-- Speeds up the path-lookup the auto-update flow does on every
-- chokidar change event: "is there already a confirmed
-- watched_folder_files row for this (workspace, folder, file_path)?"
-- Without an index, that becomes a full scan of every watched file
-- the workspace has ever ingested, which gets slow fast.
--
-- Applied to prod 2026-05-04.

CREATE INDEX IF NOT EXISTS watched_folder_files_path_lookup_idx
  ON public.watched_folder_files(workspace_id, folder_id, file_path);

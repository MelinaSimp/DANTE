-- 20260506_watched_folders_partial_unique.sql
--
-- The original unique constraint on watched_folders was
-- UNIQUE (workspace_id, device_id, folder_path) — applied
-- to ALL rows including soft-deleted ones. The DELETE handler
-- in app/api/electron/watched-folders/[id]/route.ts does a
-- soft delete (sets status='deleted') to preserve the audit
-- trail, so a user who removed a folder and tried to re-add
-- the same path got a unique-violation 23505 → "folder already
-- registered on this device" alert with the page showing zero
-- folders.
--
-- Fix: replace the blanket constraint with a partial unique
-- index that only enforces uniqueness on non-deleted rows.
-- New registrations for a path that's been previously soft-
-- deleted now succeed.
--
-- Applied to prod 2026-05-06.

ALTER TABLE public.watched_folders
  DROP CONSTRAINT IF EXISTS watched_folders_workspace_id_device_id_folder_path_key;

CREATE UNIQUE INDEX IF NOT EXISTS watched_folders_active_path_uniq
  ON public.watched_folders(workspace_id, device_id, folder_path)
  WHERE status != 'deleted';

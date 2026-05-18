-- Add confirm_mode column to watched_folders
-- Both /notify and /notify-batch endpoints SELECT this column;
-- without it, PostgREST returns a 400 error and the folder lookup
-- comes back null, silently 404-ing every file notification.
--
-- Default is 'folder_consent' so watched folders auto-confirm files
-- without requiring per-file user approval.
ALTER TABLE watched_folders
  ADD COLUMN IF NOT EXISTS confirm_mode text NOT NULL DEFAULT 'folder_consent'
  CHECK (confirm_mode IN ('per_file', 'folder_consent'));

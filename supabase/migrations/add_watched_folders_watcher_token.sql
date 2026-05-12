-- Watcher token: lets the headless drift-watcher daemon authenticate
-- against the notify API without a Supabase user session. Each folder
-- gets its own random token; revoking = nulling the column.

ALTER TABLE watched_folders
  ADD COLUMN IF NOT EXISTS watcher_token text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_watched_folders_watcher_token
  ON watched_folders (watcher_token)
  WHERE watcher_token IS NOT NULL;

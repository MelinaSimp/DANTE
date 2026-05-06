-- 20260506_watched_folder_files_status_check_extension.sql
--
-- The original status CHECK constraint on watched_folder_files
-- only allowed:
--   pending_user_confirm | accepted | rejected_extension |
--   rejected_duplicate | rejected_size | rejected_other
--
-- The routes I shipped after the original schema use four other
-- statuses that weren't in the constraint:
--   confirmed       — set by /files/[file_id]/confirm
--   auto_confirmed  — set by /notify auto-confirm path
--   auto_updated    — set by /files/auto-update
--   rejected_user   — set by /files/[file_id]/reject
--
-- Every UPDATE writing one of those values threw silently because
-- the route code didn't check the supabase update result. The
-- vault_items INSERT preceded the update and DID succeed, leaving
-- 150 orphan vault_items with no link back to their source row.
-- Cleaned those up inline; saved the migration here.
--
-- Applied to prod 2026-05-06.

ALTER TABLE public.watched_folder_files
  DROP CONSTRAINT IF EXISTS watched_folder_files_status_check;

ALTER TABLE public.watched_folder_files
  ADD CONSTRAINT watched_folder_files_status_check CHECK (status = ANY (ARRAY[
    'pending_user_confirm',
    'accepted',
    'confirmed',
    'auto_confirmed',
    'auto_updated',
    'rejected_user',
    'rejected_extension',
    'rejected_duplicate',
    'rejected_size',
    'rejected_other'
  ]));

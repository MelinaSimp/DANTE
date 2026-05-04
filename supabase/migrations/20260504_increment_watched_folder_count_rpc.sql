-- 20260504_increment_watched_folder_count_rpc.sql
--
-- Race-safe counter bump for watched_folders.files_indexed_count.
-- Used by the confirm-file API route after a user promotes a
-- pending file to a vault item. The fallback in the route does a
-- read-then-write which races under concurrent confirms; the RPC
-- folds it into a single statement.
--
-- Applied 2026-05-04.

CREATE OR REPLACE FUNCTION public.increment_watched_folder_count(p_folder_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.watched_folders
  SET files_indexed_count = COALESCE(files_indexed_count, 0) + 1,
      last_seen_at = NOW()
  WHERE id = p_folder_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_watched_folder_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_watched_folder_count(uuid) TO service_role;

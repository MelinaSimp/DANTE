CREATE OR REPLACE FUNCTION public.increment_watched_folder_count_by(
  p_folder_id uuid,
  p_count integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.watched_folders
  SET files_indexed_count = COALESCE(files_indexed_count, 0) + p_count,
      last_seen_at = NOW()
  WHERE id = p_folder_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_watched_folder_count_by(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_watched_folder_count_by(uuid, integer) TO service_role;

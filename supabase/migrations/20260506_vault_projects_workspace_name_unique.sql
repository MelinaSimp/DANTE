-- 20260506_vault_projects_workspace_name_unique.sql
--
-- Auto-project-from-subfolder needs a way to upsert "the LOI project
-- in this workspace" without a race condition when 50 file events
-- fire in parallel. Adds a partial unique index on
-- (workspace_id, lower(name)) so the upsert can use ON CONFLICT.
-- Case-insensitive so 'LOI' and 'loi' coalesce instead of creating
-- two projects.
--
-- Applied to prod 2026-05-06.

CREATE UNIQUE INDEX IF NOT EXISTS vault_projects_workspace_name_unique
  ON public.vault_projects (workspace_id, lower(name));

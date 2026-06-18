-- Zero-retention controls.
--
-- retain_raw_files (per workspace, default true = current behavior):
-- when false, the raw uploaded file is purged from storage after a
-- successful ingest; only the extracted text + vectors are kept. This
-- is the institutional "no raw documents at rest" posture.
--
-- raw_purged_at marks a vault item whose raw file has been removed, so
-- the source viewer falls back to retained extracted text instead of
-- trying to fetch a deleted object.

alter table public.workspaces
  add column if not exists retain_raw_files boolean not null default true;

comment on column public.workspaces.retain_raw_files is
  'When false, raw uploaded files are purged from storage after ingest; only extracted text + vectors are retained (zero-retention mode).';

alter table public.vault_items
  add column if not exists raw_purged_at timestamptz;

comment on column public.vault_items.raw_purged_at is
  'Set when the raw file was purged from storage under zero-retention mode.';

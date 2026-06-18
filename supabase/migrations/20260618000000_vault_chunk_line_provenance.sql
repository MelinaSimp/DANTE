-- Line-level provenance for vault chunks.
--
-- Each chunk already records page_number; these add the line and
-- character span within that chunk's primary page (extracted text),
-- so a cited value can be traced to an exact page AND line and
-- highlighted in the source viewer. All nullable and backfilled
-- lazily on the next ingest of a document (no data migration needed).

alter table public.vault_item_chunks
  add column if not exists line_start  integer,
  add column if not exists line_end    integer,
  add column if not exists char_start  integer,
  add column if not exists char_end    integer;

comment on column public.vault_item_chunks.line_start is '1-based first line within the chunk''s primary page (normalized extracted text).';
comment on column public.vault_item_chunks.line_end   is '1-based last line within the chunk''s primary page (normalized extracted text).';
comment on column public.vault_item_chunks.char_start is '0-based char offset of the chunk start within its primary page''s normalized text.';
comment on column public.vault_item_chunks.char_end   is 'Exclusive char offset of the chunk end within its primary page''s normalized text.';

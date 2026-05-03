-- 20260503_archive_cleanup.sql
--
-- Phase 5 W5.14 — drop the dead-weight dante_archive_* tables.
--
-- Drift's archive surface is backed by vault_items + vault_item_chunks
-- (the older naming survived in production). The dante_archive_*
-- tables exist because earlier migrations CREATE TABLE IF NOT EXISTS'd
-- them and then ALTER TABLE'd them in subsequent migrations
-- (soft-deletes, versioning). They are empty in every production
-- workspace and never queried by the canonical code path. Keeping
-- them around invites the next engineer to query the wrong place
-- (which is exactly what bit us during the citation validator
-- diagnostic).
--
-- Drop them. The validator already targets vault_items / vault_item_chunks
-- (see lib/dante/citation-validator.ts).
--
-- Safe-by-default: every DROP is wrapped in IF EXISTS. CASCADE
-- removes dependent FKs (which is fine — only references in are
-- the legacy version_id and chunk FKs we're dropping anyway).

-- IMPORTANT: this migration drops the EMPTY dante_archive_*
-- container tables. It does NOT drop the dante_archive_search RPC,
-- which reads from vault_items / vault_item_chunks and is the
-- working backend for vault.cite. Dropping the RPC would break
-- citation retrieval immediately.
--
-- Apply order:
--   1. dante_archive_versions (no incoming FKs to elsewhere we care about)
--   2. dante_archive_chunks (FK from versions; CASCADE handles)
--   3. dante_archive_documents (parent of chunks)
--
-- IF the RPC's body references these tables internally (it
-- shouldn't — it queries vault_*), the apply will fail with a
-- "function depends on table" error. In that case, do NOT proceed:
-- inspect the RPC body first via:
--   SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'dante_archive_search';
-- and reconcile.

DROP TABLE IF EXISTS dante_archive_versions CASCADE;
DROP TABLE IF EXISTS dante_archive_chunks CASCADE;
DROP TABLE IF EXISTS dante_archive_documents CASCADE;

COMMENT ON SCHEMA public IS
  'Drift production schema. Archive content lives in vault_items / vault_item_chunks. The legacy dante_archive_* tables were dropped in 20260503_archive_cleanup.sql.';

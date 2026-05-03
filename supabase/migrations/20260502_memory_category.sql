-- 20260502_memory_category.sql
--
-- Phase 3 W3.5 — vertical-aware memory category persistence.
--
-- lib/dante/memory/write.ts now writes a validated category (from the
-- per-vertical lists in lib/industry/vertical-spec.ts) into
-- dante_memory.metadata.category. This migration ensures the column
-- exists and adds an expression index so dashboards / scorecards can
-- query category counts without a sequential scan.

ALTER TABLE dante_memory
  ADD COLUMN IF NOT EXISTS metadata jsonb;

CREATE INDEX IF NOT EXISTS idx_dante_memory_category
  ON dante_memory ((metadata->>'category'))
  WHERE metadata->>'category' IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN dante_memory.metadata IS
  'Free-form jsonb. Known keys: "category" (one of the per-vertical taxonomy values from lib/industry/vertical-spec.ts).';

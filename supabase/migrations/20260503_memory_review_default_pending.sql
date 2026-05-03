-- 20260503_memory_review_default_pending.sql
--
-- Defense-in-depth follow-up to 20260502_memory_review_queue.sql.
--
-- The application write helper (lib/dante/memory/write.ts) already
-- defaults non-manual writes to review_status='pending'. The SQL
-- column default, however, was 'approved' — left that way so a one-
-- time backfill of pre-migration rows stayed searchable.
--
-- That backfill window is closed. Flip the column default to
-- 'pending' so any future direct INSERT that bypasses remember()
-- (e.g. a hand-written admin tool, a misrouted integration) is
-- gated by the review queue rather than going live silently. The
-- compliance posture wants the safest default at the database
-- boundary regardless of what the application layer does.
--
-- Existing rows are unaffected (ALTER COLUMN ... SET DEFAULT does
-- not touch existing data).

ALTER TABLE dante_memory
  ALTER COLUMN review_status SET DEFAULT 'pending';

COMMENT ON COLUMN dante_memory.review_status IS
  'AI-written rows default to pending; require human approval before they appear in memory.search results. Column default flipped to pending in 20260503 — application write helper enforces the same default but the DB-level guarantee matters when the helper is bypassed.';

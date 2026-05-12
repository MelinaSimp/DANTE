-- Soft-delete support for dante_chats.
-- Hard deletion destroys audit trails (citations, grounding scores,
-- tool traces) which are required for compliance in regulated verticals.

ALTER TABLE dante_chats
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Partial index: active chats only. All list queries filter on
-- deleted_at IS NULL, so this index keeps them fast without
-- indexing the (rare) soft-deleted rows.
CREATE INDEX IF NOT EXISTS idx_dante_chats_active
  ON dante_chats (workspace_id, user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

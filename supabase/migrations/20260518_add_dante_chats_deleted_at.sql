-- Add deleted_at column to dante_chats for soft-delete support.
-- The /api/dante/chats endpoint filters .is("deleted_at", null)
-- but this column never existed, causing PostgREST to error and
-- the chat history sidebar to always show "No chats yet."
ALTER TABLE dante_chats
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

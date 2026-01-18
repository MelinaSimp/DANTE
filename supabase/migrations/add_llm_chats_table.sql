-- LLM Chats table for storing chat history
CREATE TABLE IF NOT EXISTS llm_chats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Chat',
  messages JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE llm_chats ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can read their own chats" ON llm_chats
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own chats" ON llm_chats
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chats" ON llm_chats
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chats" ON llm_chats
  FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_llm_chats_user_id ON llm_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_llm_chats_workspace_id ON llm_chats(workspace_id);
CREATE INDEX IF NOT EXISTS idx_llm_chats_updated_at ON llm_chats(updated_at DESC);




-- LLM Guidelines/Templates table
-- Stores templates and guidelines for LLM interactions
-- Supports both per-agent and per-chat templates

CREATE TABLE IF NOT EXISTS llm_guidelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  chat_id UUID REFERENCES llm_chats(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default Template',
  template TEXT NOT NULL, -- The template content with inline comments
  is_agent_template BOOLEAN DEFAULT true, -- true for agent-level, false for chat-level
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_scope CHECK (
    (agent_id IS NOT NULL AND chat_id IS NULL) OR 
    (agent_id IS NULL AND chat_id IS NOT NULL) OR
    (agent_id IS NOT NULL AND chat_id IS NOT NULL)
  )
);

-- Enable RLS
ALTER TABLE llm_guidelines ENABLE ROW LEVEL SECURITY;

-- RLS Policies (drop existing first)
DROP POLICY IF EXISTS "Users can read guidelines for their workspace agents" ON llm_guidelines;
CREATE POLICY "Users can read guidelines for their workspace agents" ON llm_guidelines
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agents a
      JOIN profiles p ON a.workspace_id = p.workspace_id
      WHERE (llm_guidelines.agent_id = a.id OR llm_guidelines.agent_id IS NULL)
      AND p.id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM llm_chats lc
      JOIN profiles p ON lc.workspace_id = p.workspace_id
      WHERE llm_guidelines.chat_id = lc.id
      AND p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create guidelines for their workspace agents" ON llm_guidelines;
CREATE POLICY "Users can create guidelines for their workspace agents" ON llm_guidelines
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agents a
      JOIN profiles p ON a.workspace_id = p.workspace_id
      WHERE llm_guidelines.agent_id = a.id
      AND p.id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM llm_chats lc
      JOIN profiles p ON lc.workspace_id = p.workspace_id
      WHERE llm_guidelines.chat_id = lc.id
      AND p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update guidelines for their workspace agents" ON llm_guidelines;
CREATE POLICY "Users can update guidelines for their workspace agents" ON llm_guidelines
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM agents a
      JOIN profiles p ON a.workspace_id = p.workspace_id
      WHERE llm_guidelines.agent_id = a.id
      AND p.id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM llm_chats lc
      JOIN profiles p ON lc.workspace_id = p.workspace_id
      WHERE llm_guidelines.chat_id = lc.id
      AND p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete guidelines for their workspace agents" ON llm_guidelines;
CREATE POLICY "Users can delete guidelines for their workspace agents" ON llm_guidelines
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM agents a
      JOIN profiles p ON a.workspace_id = p.workspace_id
      WHERE llm_guidelines.agent_id = a.id
      AND p.id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM llm_chats lc
      JOIN profiles p ON lc.workspace_id = p.workspace_id
      WHERE llm_guidelines.chat_id = lc.id
      AND p.id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_llm_guidelines_agent_id ON llm_guidelines(agent_id);
CREATE INDEX IF NOT EXISTS idx_llm_guidelines_chat_id ON llm_guidelines(chat_id);
CREATE INDEX IF NOT EXISTS idx_llm_guidelines_active ON llm_guidelines(is_active) WHERE is_active = true;

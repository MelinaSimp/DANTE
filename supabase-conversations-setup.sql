-- Conversations and conversation state management
-- Run this in your Supabase SQL editor
-- NOTE: This requires the agents, workspaces, scenarios, and steps tables to exist first.
-- If you haven't run the main setup SQL, please run SETUP_DATABASE.sql first.

-- Check if required tables exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agents') THEN
    RAISE EXCEPTION 'The agents table does not exist. Please run SETUP_DATABASE.sql first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
    RAISE EXCEPTION 'The workspaces table does not exist. Please run SETUP_DATABASE.sql first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scenarios') THEN
    RAISE EXCEPTION 'The scenarios table does not exist. Please run SETUP_DATABASE.sql first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'steps') THEN
    RAISE EXCEPTION 'The steps table does not exist. Please run SETUP_DATABASE.sql first.';
  END IF;
  
  -- Check if agents table has id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'agents' AND column_name = 'id'
  ) THEN
    RAISE EXCEPTION 'The agents table exists but does not have an id column. Please check your database schema.';
  END IF;
END $$;

-- Drop conversations table if it exists (to start fresh)
DROP TABLE IF EXISTS conversation_steps CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;

-- Conversations table - tracks ongoing conversations
CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  modality TEXT NOT NULL CHECK (modality IN ('chat', 'voice', 'multi-modal')),
  channel_id TEXT, -- For voice: call_sid, for chat: session_id
  from_number TEXT, -- Phone number for voice calls
  to_number TEXT, -- Agent phone number
  current_scenario_id UUID REFERENCES scenarios(id),
  current_step_id UUID REFERENCES steps(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'transferred')),
  gathered_data JSONB DEFAULT '{}'::jsonb, -- Store collected information
  conversation_state JSONB DEFAULT '{}'::jsonb, -- Store any state variables
  transcript JSONB DEFAULT '[]'::jsonb, -- Store message history
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversation steps - track each step execution
CREATE TABLE conversation_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES steps(id),
  step_type TEXT NOT NULL,
  input_data JSONB, -- User input for this step
  output_data JSONB, -- Step output/response
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  execution_time_ms INTEGER, -- How long the step took
  error_message TEXT, -- If step failed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_steps ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversations (drop existing first)
DROP POLICY IF EXISTS "Users can read conversations in their workspace" ON conversations;
CREATE POLICY "Users can read conversations in their workspace" ON conversations
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert conversations in their workspace" ON conversations;
CREATE POLICY "Users can insert conversations in their workspace" ON conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update conversations in their workspace" ON conversations;
CREATE POLICY "Users can update conversations in their workspace" ON conversations
  FOR UPDATE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS Policies for conversation_steps (drop existing first)
DROP POLICY IF EXISTS "Users can read conversation_steps in their workspace" ON conversation_steps;
CREATE POLICY "Users can read conversation_steps in their workspace" ON conversation_steps
  FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE workspace_id IN (
        SELECT workspace_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert conversation_steps in their workspace" ON conversation_steps;
CREATE POLICY "Users can insert conversation_steps in their workspace" ON conversation_steps
  FOR INSERT
  TO authenticated
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM conversations WHERE workspace_id IN (
        SELECT workspace_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_conversations_agent_id ON conversations(agent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_id ON conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversations_channel_id ON conversations(channel_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_conversation_steps_conversation_id ON conversation_steps(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_steps_step_id ON conversation_steps(step_id);

-- Create updated_at trigger (if function exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
    CREATE TRIGGER update_conversations_updated_at
      BEFORE UPDATE ON conversations
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Success message
SELECT 'Conversations tables created successfully!' as status;


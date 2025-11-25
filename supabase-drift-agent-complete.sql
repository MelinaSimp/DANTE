-- Complete Drift Agent Builder Schema
-- Run this in Supabase SQL Editor to set up all tables

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add phone_number to agents table (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'agents' AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE agents ADD COLUMN phone_number TEXT;
  END IF;
END $$;

-- Supporting documents table
CREATE TABLE IF NOT EXISTS supporting_docs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('file', 'text')),
  content TEXT, -- For text type
  file_url TEXT, -- For file type
  file_size BIGINT,
  file_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supporting_docs_agent ON supporting_docs(agent_id);

-- Personalization settings table
CREATE TABLE IF NOT EXISTS agent_personalization (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  voice_model TEXT DEFAULT 'professional',
  personality TEXT DEFAULT 'helpful',
  response_style TEXT DEFAULT 'concise',
  humor_level TEXT DEFAULT 'none',
  formality TEXT DEFAULT 'neutral',
  response_length TEXT DEFAULT 'medium',
  language TEXT DEFAULT 'english',
  emoji_usage TEXT DEFAULT 'none',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personalization_agent ON agent_personalization(agent_id);

-- Advanced settings table
CREATE TABLE IF NOT EXISTS agent_advanced_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  api_key TEXT,
  webhooks JSONB DEFAULT '[]'::jsonb,
  database_connections JSONB DEFAULT '[]'::jsonb,
  custom_code TEXT,
  debug_mode BOOLEAN DEFAULT false,
  rate_limiting INT DEFAULT 100,
  timeout_seconds INT DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advanced_settings_agent ON agent_advanced_settings(agent_id);

-- Policies table (for Policies page)
CREATE TABLE IF NOT EXISTS agent_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('file', 'text')),
  content TEXT, -- For text type
  file_url TEXT, -- For file type
  file_size BIGINT,
  file_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policies_agent ON agent_policies(agent_id);

-- Data sources table (for Data Sources page)
CREATE TABLE IF NOT EXISTS agent_data_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('file', 'text')),
  content TEXT, -- For text type
  file_url TEXT, -- For file type
  file_size BIGINT,
  file_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_sources_agent ON agent_data_sources(agent_id);

-- Call sessions table (for Twilio call state management)
CREATE TABLE IF NOT EXISTS call_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_sid TEXT NOT NULL UNIQUE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  scenario_id UUID REFERENCES scenarios(id) ON DELETE SET NULL,
  current_step_id UUID REFERENCES steps(id) ON DELETE SET NULL,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  status TEXT DEFAULT 'ringing',
  conversation_state JSONB DEFAULT '{}'::jsonb,
  transcript JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_call_sid ON call_sessions(call_sid);
CREATE INDEX IF NOT EXISTS idx_call_sessions_agent ON call_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_workspace ON call_sessions(workspace_id);

-- Update triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
DROP TRIGGER IF EXISTS update_supporting_docs_updated_at ON supporting_docs;
CREATE TRIGGER update_supporting_docs_updated_at
  BEFORE UPDATE ON supporting_docs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_personalization_updated_at ON agent_personalization;
CREATE TRIGGER update_personalization_updated_at
  BEFORE UPDATE ON agent_personalization
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_advanced_settings_updated_at ON agent_advanced_settings;
CREATE TRIGGER update_advanced_settings_updated_at
  BEFORE UPDATE ON agent_advanced_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_call_sessions_updated_at ON call_sessions;
CREATE TRIGGER update_call_sessions_updated_at
  BEFORE UPDATE ON call_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on new tables
ALTER TABLE supporting_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_personalization ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_advanced_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for supporting_docs
CREATE POLICY "Users can manage supporting docs for their workspace agents" ON supporting_docs
  FOR ALL
  TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM agents WHERE workspace_id IN (
        SELECT workspace_id FROM profiles WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    agent_id IN (
      SELECT id FROM agents WHERE workspace_id IN (
        SELECT workspace_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- RLS Policies for agent_personalization
CREATE POLICY "Users can manage personalization for their workspace agents" ON agent_personalization
  FOR ALL
  TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM agents WHERE workspace_id IN (
        SELECT workspace_id FROM profiles WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    agent_id IN (
      SELECT id FROM agents WHERE workspace_id IN (
        SELECT workspace_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- RLS Policies for agent_advanced_settings
CREATE POLICY "Users can manage advanced settings for their workspace agents" ON agent_advanced_settings
  FOR ALL
  TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM agents WHERE workspace_id IN (
        SELECT workspace_id FROM profiles WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    agent_id IN (
      SELECT id FROM agents WHERE workspace_id IN (
        SELECT workspace_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- RLS Policies for agent_policies
CREATE POLICY "Users can manage policies for their workspace agents" ON agent_policies
  FOR ALL
  TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM agents WHERE workspace_id IN (
        SELECT workspace_id FROM profiles WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    agent_id IN (
      SELECT id FROM agents WHERE workspace_id IN (
        SELECT workspace_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- RLS Policies for agent_data_sources
CREATE POLICY "Users can manage data sources for their workspace agents" ON agent_data_sources
  FOR ALL
  TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM agents WHERE workspace_id IN (
        SELECT workspace_id FROM profiles WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    agent_id IN (
      SELECT id FROM agents WHERE workspace_id IN (
        SELECT workspace_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- RLS Policies for call_sessions
CREATE POLICY "Users can view call sessions for their workspace" ON call_sessions
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage call sessions" ON call_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

SELECT 'Drift Agent Builder schema updated successfully!' as status;










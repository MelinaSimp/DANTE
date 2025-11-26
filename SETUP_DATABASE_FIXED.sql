-- ============================================
-- DRIFT AGENT BUILDER - COMPLETE DATABASE SETUP (FIXED)
-- ============================================
-- Run this entire file in your Supabase SQL Editor
-- This sets up all tables needed for the Drift Agent Builder
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. BASE TABLES (Agents, Scenarios, Steps, Branches)
-- ============================================

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  modality TEXT NOT NULL CHECK (modality IN ('chat', 'voice', 'multi-modal')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'deployed', 'archived')),
  description TEXT,
  phone_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add phone_number column if it doesn't exist (for existing tables)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'agents' AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE agents ADD COLUMN phone_number TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agents_phone_number ON agents(phone_number) WHERE phone_number IS NOT NULL;

-- Scenarios table (like "New account onboarding")
CREATE TABLE IF NOT EXISTS scenarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scenarios_agent ON scenarios(agent_id, sort_order);

-- Steps table (individual steps in a scenario)
CREATE TABLE IF NOT EXISTS steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scenario_id UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('say', 'gather', 'code', 'api_call', 'if')),
  code TEXT,
  ai_message TEXT,
  input_schema JSONB DEFAULT '{}'::jsonb,
  callable_functions JSONB DEFAULT '[]'::jsonb,
  apis JSONB DEFAULT '[]'::jsonb,
  global_variables JSONB DEFAULT '{}'::jsonb,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_steps_scenario ON steps(scenario_id, sort_order);

-- Step branches (conditional flows)
CREATE TABLE IF NOT EXISTS step_branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  step_id UUID NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
  condition TEXT NOT NULL,
  condition_tag TEXT,
  next_step_id UUID REFERENCES steps(id) ON DELETE SET NULL,
  next_scenario_id UUID REFERENCES scenarios(id) ON DELETE SET NULL,
  action TEXT,
  target TEXT, -- Natural language target description
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_step_branches_step ON step_branches(step_id);

-- ============================================
-- 2. DOCUMENT TABLES
-- ============================================

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

-- Training documents for agents (legacy, kept for compatibility)
CREATE TABLE IF NOT EXISTS agent_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_type TEXT,
  file_url TEXT,
  file_size BIGINT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_documents_agent ON agent_documents(agent_id);

-- ============================================
-- 3. SETTINGS TABLES
-- ============================================

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

-- ============================================
-- 4. TESTING & CALLS TABLES
-- ============================================

-- Test results
CREATE TABLE IF NOT EXISTS agent_test_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  test_case_name TEXT,
  status TEXT CHECK (status IN ('passed', 'failed')),
  pass_rate DECIMAL(5,2),
  simulations_passed INT DEFAULT 0,
  simulations_failed INT DEFAULT 0,
  total_simulations INT DEFAULT 0,
  conditions_met TEXT,
  failure_conditions TEXT,
  test_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_results_agent ON agent_test_results(agent_id, created_at DESC);

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

-- ============================================
-- 5. TRIGGERS & FUNCTIONS
-- ============================================

-- Update triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
DROP TRIGGER IF EXISTS update_agents_updated_at ON agents;
CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_scenarios_updated_at ON scenarios;
CREATE TRIGGER update_scenarios_updated_at
  BEFORE UPDATE ON scenarios
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_steps_updated_at ON steps;
CREATE TRIGGER update_steps_updated_at
  BEFORE UPDATE ON steps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

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

-- ============================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE step_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE supporting_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_personalization ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_advanced_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for agents
DROP POLICY IF EXISTS "Users can manage agents in their workspace" ON agents;
CREATE POLICY "Users can manage agents in their workspace" ON agents
  FOR ALL
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

-- RLS Policies for scenarios
DROP POLICY IF EXISTS "Users can manage scenarios for their workspace agents" ON scenarios;
CREATE POLICY "Users can manage scenarios for their workspace agents" ON scenarios
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

-- RLS Policies for steps
DROP POLICY IF EXISTS "Users can manage steps for their workspace agents" ON steps;
CREATE POLICY "Users can manage steps for their workspace agents" ON steps
  FOR ALL
  TO authenticated
  USING (
    scenario_id IN (
      SELECT id FROM scenarios WHERE agent_id IN (
        SELECT id FROM agents WHERE workspace_id IN (
          SELECT workspace_id FROM profiles WHERE id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    scenario_id IN (
      SELECT id FROM scenarios WHERE agent_id IN (
        SELECT id FROM agents WHERE workspace_id IN (
          SELECT workspace_id FROM profiles WHERE id = auth.uid()
        )
      )
    )
  );

-- RLS Policies for step_branches
DROP POLICY IF EXISTS "Users can manage branches for their workspace agents" ON step_branches;
CREATE POLICY "Users can manage branches for their workspace agents" ON step_branches
  FOR ALL
  TO authenticated
  USING (
    step_id IN (
      SELECT id FROM steps WHERE scenario_id IN (
        SELECT id FROM scenarios WHERE agent_id IN (
          SELECT id FROM agents WHERE workspace_id IN (
            SELECT workspace_id FROM profiles WHERE id = auth.uid()
          )
        )
      )
    )
  )
  WITH CHECK (
    step_id IN (
      SELECT id FROM steps WHERE scenario_id IN (
        SELECT id FROM scenarios WHERE agent_id IN (
          SELECT id FROM agents WHERE workspace_id IN (
            SELECT workspace_id FROM profiles WHERE id = auth.uid()
          )
        )
      )
    )
  );

-- RLS Policies for supporting_docs
DROP POLICY IF EXISTS "Users can manage supporting docs for their workspace agents" ON supporting_docs;
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
DROP POLICY IF EXISTS "Users can manage personalization for their workspace agents" ON agent_personalization;
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
DROP POLICY IF EXISTS "Users can manage advanced settings for their workspace agents" ON agent_advanced_settings;
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
DROP POLICY IF EXISTS "Users can manage policies for their workspace agents" ON agent_policies;
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
DROP POLICY IF EXISTS "Users can manage data sources for their workspace agents" ON agent_data_sources;
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

-- RLS Policies for agent_documents
DROP POLICY IF EXISTS "Users can manage documents for their workspace agents" ON agent_documents;
CREATE POLICY "Users can manage documents for their workspace agents" ON agent_documents
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

-- RLS Policies for agent_test_results
DROP POLICY IF EXISTS "Users can view test results for their workspace agents" ON agent_test_results;
CREATE POLICY "Users can view test results for their workspace agents" ON agent_test_results
  FOR SELECT
  TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM agents WHERE workspace_id IN (
        SELECT workspace_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- RLS Policies for call_sessions
DROP POLICY IF EXISTS "Users can view call sessions for their workspace" ON call_sessions;
CREATE POLICY "Users can view call sessions for their workspace" ON call_sessions
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role can manage call sessions" ON call_sessions;
CREATE POLICY "Service role can manage call sessions" ON call_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
SELECT 'Drift Agent Builder database setup completed successfully!' as status;











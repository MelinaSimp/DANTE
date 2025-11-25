-- GigaAI-style Agent Builder Schema
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  modality TEXT NOT NULL CHECK (modality IN ('chat', 'voice', 'multi-modal')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'deployed', 'archived')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id);

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
  type TEXT NOT NULL CHECK (type IN ('say', 'gather', 'code', 'api_call', 'condition')),
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
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_step_branches_step ON step_branches(step_id);

-- Training documents for agents
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

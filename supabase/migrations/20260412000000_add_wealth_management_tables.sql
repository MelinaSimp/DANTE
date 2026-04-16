-- Wealth Management Dashboard Tables
-- Ported from Drift-AI (Prisma schema) to Supabase

-- WM Clients (wealth management clients, separate from CRM contacts)
CREATE TABLE IF NOT EXISTS wm_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  type TEXT NOT NULL DEFAULT 'INDIVIDUAL',
  risk_profile TEXT DEFAULT 'MODERATE',
  aum DOUBLE PRECISION DEFAULT 0,
  churn_score INT DEFAULT 0,
  last_contact_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_wm_clients_workspace ON wm_clients(workspace_id);

-- WM Intelligence Profiles
CREATE TABLE IF NOT EXISTS wm_intelligence_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES wm_clients(id) ON DELETE CASCADE,
  family_context TEXT,
  communication TEXT,
  concerns TEXT,
  goals TEXT,
  life_stage TEXT,
  sentiment_score INT DEFAULT 80,
  relation_strength INT DEFAULT 70,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- WM Opportunities
CREATE TABLE IF NOT EXISTS wm_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES wm_clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  value_est DOUBLE PRECISION,
  confidence DOUBLE PRECISION DEFAULT 70,
  description TEXT NOT NULL,
  evidence TEXT,
  reasoning TEXT,
  suggested_action TEXT NOT NULL,
  status TEXT DEFAULT 'DRAFT',
  risk_level TEXT DEFAULT 'LOW',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_wm_opportunities_client ON wm_opportunities(client_id, status);

-- WM Tax Insights
CREATE TABLE IF NOT EXISTS wm_tax_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES wm_clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT,
  rationale TEXT NOT NULL,
  urgency TEXT DEFAULT 'MEDIUM',
  confidence DOUBLE PRECISION DEFAULT 80,
  suggested_action TEXT NOT NULL,
  status TEXT DEFAULT 'UNDER_REVIEW',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- WM Meetings
CREATE TABLE IF NOT EXISTS wm_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES wm_clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT DEFAULT 'REVIEW',
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'SCHEDULED',
  brief_text TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- WM Tasks
CREATE TABLE IF NOT EXISTS wm_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id UUID REFERENCES wm_clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  priority TEXT DEFAULT 'MEDIUM',
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- WM Compliance Flags
CREATE TABLE IF NOT EXISTS wm_compliance_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  severity TEXT DEFAULT 'MEDIUM',
  description TEXT NOT NULL,
  status TEXT DEFAULT 'OPEN',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- WM Agent Definitions
CREATE TABLE IF NOT EXISTS wm_agent_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  type TEXT DEFAULT 'AUTONOMOUS',
  status TEXT DEFAULT 'IDLE',
  success_rate DOUBLE PRECISION DEFAULT 0,
  confidence_level DOUBLE PRECISION DEFAULT 0,
  outputs_today INT DEFAULT 0,
  pending_reviews INT DEFAULT 0,
  icon TEXT DEFAULT 'Zap',
  color_class TEXT DEFAULT 'text-blue-400',
  last_run TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- WM Agent Tasks
CREATE TABLE IF NOT EXISTS wm_agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES wm_agent_definitions(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  output TEXT,
  linked_client TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- WM Agent Outputs
CREATE TABLE IF NOT EXISTS wm_agent_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES wm_agent_definitions(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  summary TEXT NOT NULL,
  review_status TEXT DEFAULT 'PENDING',
  linked_client TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed demo data for immediate visual feedback
INSERT INTO wm_clients (id, workspace_id, name, type, aum, risk_profile, churn_score, last_contact_at)
SELECT
  gen_random_uuid(),
  w.id,
  client.name,
  client.type,
  client.aum,
  client.risk,
  client.churn,
  now() - (client.days_ago || ' days')::interval
FROM workspaces w
CROSS JOIN (VALUES
  ('Peterson Household', 'HOUSEHOLD', 4200000, 'MODERATE_GROWTH', 15, '12'),
  ('Sarah Jenkins', 'INDIVIDUAL', 850000, 'CONSERVATIVE', 82, '270'),
  ('Dr. Amanda Reyes', 'INDIVIDUAL', 6800000, 'AGGRESSIVE', 5, '2'),
  ('Williams Trust', 'ENTITY', 12400000, 'BALANCED', 20, '21'),
  ('The Harrison Family', 'HOUSEHOLD', 21500000, 'GROWTH', 30, '30')
) AS client(name, type, aum, risk, churn, days_ago)
LIMIT 5;

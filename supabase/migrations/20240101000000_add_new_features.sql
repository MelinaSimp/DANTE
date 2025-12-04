-- Migration: Add new features (loop, transfer, SMS, live data sources, multi-agent routing)
-- Run this migration in Supabase SQL editor

-- ============================================
-- 1. AGENTS TABLE MODIFICATIONS
-- ============================================

-- Add agent role and specialist routing fields
ALTER TABLE agents 
  ADD COLUMN IF NOT EXISTS agent_role VARCHAR(50),
  ADD COLUMN IF NOT EXISTS is_specialist BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_agent_id UUID REFERENCES agents(id),
  ADD COLUMN IF NOT EXISTS routing_keywords TEXT[];

-- Add index for specialist lookup
CREATE INDEX IF NOT EXISTS idx_agents_specialist ON agents(workspace_id, is_specialist, agent_role, status);

-- ============================================
-- 2. STEPS TABLE MODIFICATIONS
-- ============================================

-- Update step type constraint (remove 'if', add 'loop', 'send_sms', 'transfer', 'qa')
ALTER TABLE steps DROP CONSTRAINT IF EXISTS steps_type_check;
ALTER TABLE steps ADD CONSTRAINT steps_type_check 
  CHECK (type IN ('say', 'gather', 'code', 'api_call', 'schedule', 'qa', 'loop', 'send_sms', 'transfer'));

-- Add selected data source IDs for Q/A steps
ALTER TABLE steps ADD COLUMN IF NOT EXISTS selected_data_source_ids JSONB DEFAULT '[]'::jsonb;

-- Add loop configuration for loop steps
ALTER TABLE steps ADD COLUMN IF NOT EXISTS loop_config JSONB;

-- Add transfer configuration for transfer steps
ALTER TABLE steps ADD COLUMN IF NOT EXISTS transfer_config JSONB;

-- Add SMS configuration for send_sms steps
ALTER TABLE steps ADD COLUMN IF NOT EXISTS sms_config JSONB;

-- ============================================
-- 3. AGENT_DATA_SOURCES TABLE MODIFICATIONS
-- ============================================

-- Add integration type field
ALTER TABLE agent_data_sources 
  ADD COLUMN IF NOT EXISTS integration_type VARCHAR(50) DEFAULT 'static',
  ADD COLUMN IF NOT EXISTS integration_config JSONB,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_status VARCHAR(50) DEFAULT 'pending';

-- Add index for integration lookups
CREATE INDEX IF NOT EXISTS idx_data_sources_integration ON agent_data_sources(agent_id, integration_type);

-- ============================================
-- 4. CONVERSATIONS TABLE MODIFICATIONS
-- ============================================

-- Add transfer tracking fields
ALTER TABLE conversations 
  ADD COLUMN IF NOT EXISTS transferred_from_agent_id UUID REFERENCES agents(id),
  ADD COLUMN IF NOT EXISTS transferred_to_agent_id UUID REFERENCES agents(id),
  ADD COLUMN IF NOT EXISTS transfer_history JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS parent_conversation_id UUID REFERENCES conversations(id),
  ADD COLUMN IF NOT EXISTS loop_state JSONB DEFAULT '{}'::jsonb;

-- Add indexes for transfer lookups
CREATE INDEX IF NOT EXISTS idx_conversations_transfer ON conversations(transferred_from_agent_id, transferred_to_agent_id);

-- ============================================
-- 5. NEW TABLE: SCHEDULED_SMS
-- ============================================

CREATE TABLE IF NOT EXISTS scheduled_sms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  message TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  error_message TEXT,
  error_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_sms_status ON scheduled_sms(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_sms_conversation ON scheduled_sms(conversation_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_sms_workspace ON scheduled_sms(workspace_id);

-- Enable RLS
ALTER TABLE scheduled_sms ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can manage scheduled SMS in their workspace" ON scheduled_sms;
CREATE POLICY "Users can manage scheduled SMS in their workspace" ON scheduled_sms
  FOR ALL
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ============================================
-- 6. NEW TABLE: INTEGRATION_CREDENTIALS
-- ============================================

CREATE TABLE IF NOT EXISTS integration_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  integration_type VARCHAR(50) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  encrypted_oauth_token TEXT,
  encrypted_refresh_token TEXT,
  encrypted_api_key TEXT,
  token_expires_at TIMESTAMPTZ,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, integration_type, provider)
);

CREATE INDEX IF NOT EXISTS idx_integration_credentials_workspace ON integration_credentials(workspace_id);

-- Enable RLS
ALTER TABLE integration_credentials ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can manage integration credentials in their workspace" ON integration_credentials;
CREATE POLICY "Users can manage integration credentials in their workspace" ON integration_credentials
  FOR ALL
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ============================================
-- 7. NEW TABLE: RESPONSE_CACHE
-- ============================================

CREATE TABLE IF NOT EXISTS response_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  response TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_response_cache_key ON response_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_response_cache_expires ON response_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_response_cache_agent ON response_cache(agent_id);

-- Auto-cleanup function (runs via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM response_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 8. NEW TABLE: ERROR_LOGS (for error tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  source VARCHAR(200) NOT NULL,
  error_message TEXT,
  error_stack TEXT,
  error_code VARCHAR(50),
  context JSONB DEFAULT '{}'::jsonb,
  severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_type ON error_logs(type, timestamp);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity, timestamp);
CREATE INDEX IF NOT EXISTS idx_error_logs_workspace ON error_logs(workspace_id);

-- Enable RLS
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can read error logs in their workspace" ON error_logs;
CREATE POLICY "Users can read error logs in their workspace" ON error_logs
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ============================================
-- 9. MIGRATE EXISTING IF STEPS
-- ============================================

-- Convert existing If steps to Gather steps with branches
-- This is a data migration - existing If steps will need manual conversion
-- We'll just log them for now
DO $$
DECLARE
  if_step_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO if_step_count FROM steps WHERE type = 'if';
  
  IF if_step_count > 0 THEN
    RAISE NOTICE 'Found % If steps that need manual conversion to Gather/Q/A steps with branches', if_step_count;
    -- In production, you might want to create a migration script to convert these
  END IF;
END $$;

-- ============================================
-- 10. ADD HELPER FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_scheduled_sms_updated_at ON scheduled_sms;
CREATE TRIGGER update_scheduled_sms_updated_at
  BEFORE UPDATE ON scheduled_sms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_integration_credentials_updated_at ON integration_credentials;
CREATE TRIGGER update_integration_credentials_updated_at
  BEFORE UPDATE ON integration_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();




-- Enable RLS on all wealth-management tables.
-- Pattern follows 20260409000000_add_rls_availability_slots.sql:
--   - scope reads/writes to the caller's workspace via profiles.workspace_id
--   - keep service-role bypass for admin API routes
-- Tables that don't carry workspace_id directly (intelligence_profiles,
-- opportunities, tax_insights, meetings) filter through wm_clients.

-- ==========================================================================
-- wm_clients
-- ==========================================================================
ALTER TABLE wm_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wm_clients: workspace read"
  ON wm_clients FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_clients: workspace insert"
  ON wm_clients FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_clients: workspace update"
  ON wm_clients FOR UPDATE
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_clients: workspace delete"
  ON wm_clients FOR DELETE
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_clients: service role"
  ON wm_clients FOR ALL
  USING (auth.role() = 'service_role');


-- ==========================================================================
-- wm_intelligence_profiles (scoped via client_id → wm_clients.workspace_id)
-- ==========================================================================
ALTER TABLE wm_intelligence_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wm_intel: workspace read"
  ON wm_intelligence_profiles FOR SELECT
  USING (client_id IN (
    SELECT id FROM wm_clients
    WHERE workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "wm_intel: workspace write"
  ON wm_intelligence_profiles FOR ALL
  USING (client_id IN (
    SELECT id FROM wm_clients
    WHERE workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  ))
  WITH CHECK (client_id IN (
    SELECT id FROM wm_clients
    WHERE workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "wm_intel: service role"
  ON wm_intelligence_profiles FOR ALL
  USING (auth.role() = 'service_role');


-- ==========================================================================
-- wm_opportunities (scoped via client_id)
-- ==========================================================================
ALTER TABLE wm_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wm_opps: workspace read"
  ON wm_opportunities FOR SELECT
  USING (client_id IN (
    SELECT id FROM wm_clients
    WHERE workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "wm_opps: workspace write"
  ON wm_opportunities FOR ALL
  USING (client_id IN (
    SELECT id FROM wm_clients
    WHERE workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  ))
  WITH CHECK (client_id IN (
    SELECT id FROM wm_clients
    WHERE workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "wm_opps: service role"
  ON wm_opportunities FOR ALL
  USING (auth.role() = 'service_role');


-- ==========================================================================
-- wm_tax_insights (scoped via client_id)
-- ==========================================================================
ALTER TABLE wm_tax_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wm_tax: workspace read"
  ON wm_tax_insights FOR SELECT
  USING (client_id IN (
    SELECT id FROM wm_clients
    WHERE workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "wm_tax: workspace write"
  ON wm_tax_insights FOR ALL
  USING (client_id IN (
    SELECT id FROM wm_clients
    WHERE workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  ))
  WITH CHECK (client_id IN (
    SELECT id FROM wm_clients
    WHERE workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "wm_tax: service role"
  ON wm_tax_insights FOR ALL
  USING (auth.role() = 'service_role');


-- ==========================================================================
-- wm_meetings (scoped via client_id)
-- ==========================================================================
ALTER TABLE wm_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wm_meetings: workspace read"
  ON wm_meetings FOR SELECT
  USING (client_id IN (
    SELECT id FROM wm_clients
    WHERE workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "wm_meetings: workspace write"
  ON wm_meetings FOR ALL
  USING (client_id IN (
    SELECT id FROM wm_clients
    WHERE workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  ))
  WITH CHECK (client_id IN (
    SELECT id FROM wm_clients
    WHERE workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "wm_meetings: service role"
  ON wm_meetings FOR ALL
  USING (auth.role() = 'service_role');


-- ==========================================================================
-- wm_tasks (direct workspace_id)
-- ==========================================================================
ALTER TABLE wm_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wm_tasks: workspace read"
  ON wm_tasks FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_tasks: workspace insert"
  ON wm_tasks FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_tasks: workspace update"
  ON wm_tasks FOR UPDATE
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_tasks: workspace delete"
  ON wm_tasks FOR DELETE
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_tasks: service role"
  ON wm_tasks FOR ALL
  USING (auth.role() = 'service_role');


-- ==========================================================================
-- wm_compliance_flags (direct workspace_id)
-- ==========================================================================
ALTER TABLE wm_compliance_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wm_compliance: workspace read"
  ON wm_compliance_flags FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_compliance: workspace insert"
  ON wm_compliance_flags FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_compliance: workspace update"
  ON wm_compliance_flags FOR UPDATE
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_compliance: workspace delete"
  ON wm_compliance_flags FOR DELETE
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_compliance: service role"
  ON wm_compliance_flags FOR ALL
  USING (auth.role() = 'service_role');


-- ==========================================================================
-- wm_agent_definitions (direct workspace_id)
-- ==========================================================================
ALTER TABLE wm_agent_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wm_agents: workspace read"
  ON wm_agent_definitions FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_agents: workspace insert"
  ON wm_agent_definitions FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_agents: workspace update"
  ON wm_agent_definitions FOR UPDATE
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_agents: workspace delete"
  ON wm_agent_definitions FOR DELETE
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_agents: service role"
  ON wm_agent_definitions FOR ALL
  USING (auth.role() = 'service_role');


-- ==========================================================================
-- wm_agent_tasks (direct workspace_id)
-- ==========================================================================
ALTER TABLE wm_agent_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wm_agent_tasks: workspace read"
  ON wm_agent_tasks FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_agent_tasks: workspace insert"
  ON wm_agent_tasks FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_agent_tasks: workspace update"
  ON wm_agent_tasks FOR UPDATE
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_agent_tasks: workspace delete"
  ON wm_agent_tasks FOR DELETE
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_agent_tasks: service role"
  ON wm_agent_tasks FOR ALL
  USING (auth.role() = 'service_role');


-- ==========================================================================
-- wm_agent_outputs (direct workspace_id)
-- ==========================================================================
ALTER TABLE wm_agent_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wm_outputs: workspace read"
  ON wm_agent_outputs FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_outputs: workspace insert"
  ON wm_agent_outputs FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_outputs: workspace update"
  ON wm_agent_outputs FOR UPDATE
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_outputs: workspace delete"
  ON wm_agent_outputs FOR DELETE
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "wm_outputs: service role"
  ON wm_agent_outputs FOR ALL
  USING (auth.role() = 'service_role');

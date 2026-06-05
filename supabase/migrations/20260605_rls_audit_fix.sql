-- 20260605_rls_audit_fix.sql
--
-- Enable RLS on three dante tables that were missing it.
-- All other public tables already had RLS enabled.

ALTER TABLE dante_pending_nudges ENABLE ROW LEVEL SECURITY;
ALTER TABLE dante_send_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE dante_workflow_versions ENABLE ROW LEVEL SECURITY;

-- Service role bypass (needed for server-side operations)
CREATE POLICY service_all ON dante_pending_nudges FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_all ON dante_send_counters FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_all ON dante_workflow_versions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Workspace member read access
CREATE POLICY ws_member_read ON dante_pending_nudges FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY ws_member_read ON dante_workflow_versions FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY ws_member_read ON dante_send_counters FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

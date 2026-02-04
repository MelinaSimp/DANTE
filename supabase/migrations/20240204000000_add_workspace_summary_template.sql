-- Workspace setting: optional document whose annotations define which pages to include in one-page summaries.
-- When set, we use this template's page numbers but pull content from the current client's document.
CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  summary_template_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read workspace settings" ON workspace_settings;
CREATE POLICY "Users can read workspace settings" ON workspace_settings
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update workspace settings" ON workspace_settings;
CREATE POLICY "Users can update workspace settings" ON workspace_settings
  FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_workspace_settings_workspace ON workspace_settings(workspace_id);

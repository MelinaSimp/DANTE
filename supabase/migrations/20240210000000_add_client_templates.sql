-- Multiple templates per client: save an annotated document as a reusable template
CREATE TABLE IF NOT EXISTS client_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  annotated_page_numbers INTEGER[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE client_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read templates in their workspace" ON client_templates
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert templates in their workspace" ON client_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can delete templates in their workspace" ON client_templates
  FOR DELETE TO authenticated
  USING (
    workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_client_templates_contact_id ON client_templates(contact_id);

-- Allow workspace users to update templates (e.g. rename)
CREATE POLICY "Users can update templates in their workspace" ON client_templates
  FOR UPDATE TO authenticated
  USING (
    workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
  );

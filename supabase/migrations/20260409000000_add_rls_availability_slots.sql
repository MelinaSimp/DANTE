-- Enable RLS on availability_slots
ALTER TABLE availability_slots ENABLE ROW LEVEL SECURITY;

-- Users can view slots in their own workspace
CREATE POLICY "Users can view own workspace slots"
  ON availability_slots FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can insert slots in their own workspace
CREATE POLICY "Users can insert own workspace slots"
  ON availability_slots FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can update slots in their own workspace
CREATE POLICY "Users can update own workspace slots"
  ON availability_slots FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can delete slots in their own workspace
CREATE POLICY "Users can delete own workspace slots"
  ON availability_slots FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Service role bypasses RLS (for API routes using supabaseAdmin)
CREATE POLICY "Service role full access to slots"
  ON availability_slots FOR ALL
  USING (auth.role() = 'service_role');

-- Migration script to fix appointments table
-- Run this in your Supabase SQL editor

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can read appointments in their workspace" ON appointments;
DROP POLICY IF EXISTS "Users can insert appointments in their workspace" ON appointments;
DROP POLICY IF EXISTS "Users can update appointments in their workspace" ON appointments;
DROP POLICY IF EXISTS "Users can delete appointments in their workspace" ON appointments;

-- Create policies for appointments
CREATE POLICY "Users can read appointments in their workspace" ON appointments
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert appointments in their workspace" ON appointments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update appointments in their workspace" ON appointments
  FOR UPDATE
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

CREATE POLICY "Users can delete appointments in their workspace" ON appointments
  FOR DELETE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_appointments_workspace_id ON appointments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_appointments_contact_id ON appointments(contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_appointments_updated_at ON appointments;

-- Create updated_at trigger
CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Success message
SELECT 'Appointments table migration completed successfully!' as status;

-- Migration script to fix workspaces table
-- Run this in your Supabase SQL editor

-- First, check if the table exists and what columns it has
-- If the table doesn't have the owner_id column, add it

-- Add owner_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'workspaces' 
        AND column_name = 'owner_id'
    ) THEN
        ALTER TABLE workspaces ADD COLUMN owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add other columns if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'workspaces' 
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE workspaces ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'workspaces' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE workspaces ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- Enable RLS if not already enabled
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can read their own workspace" ON workspaces;
DROP POLICY IF EXISTS "Users can insert their own workspace" ON workspaces;
DROP POLICY IF EXISTS "Users can update their own workspace" ON workspaces;
DROP POLICY IF EXISTS "Users can delete their own workspace" ON workspaces;

-- Create policies for workspaces
CREATE POLICY "Users can read their own workspace" ON workspaces
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert their own workspace" ON workspaces
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update their own workspace" ON workspaces
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete their own workspace" ON workspaces
  FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON workspaces(owner_id);

-- Create or replace the updated_at function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_workspaces_updated_at ON workspaces;

-- Create updated_at trigger
CREATE TRIGGER update_workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Success message
SELECT 'Workspaces table migration completed successfully!' as status;

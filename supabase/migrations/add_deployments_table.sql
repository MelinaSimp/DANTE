-- Create deployments table to track deployment status
CREATE TABLE IF NOT EXISTS deployments (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'deploying', 'deployed', 'cancelled', 'failed')),
  started_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_deployments_workspace_id ON deployments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);

-- Add RLS policies
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own workspace deployments
CREATE POLICY "Users can view their workspace deployments"
  ON deployments FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Allow service role to manage all deployments
CREATE POLICY "Service role can manage deployments"
  ON deployments FOR ALL
  USING (true)
  WITH CHECK (true);








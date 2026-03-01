-- Feature gating: stores which features each workspace has access to
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS enabled_features TEXT[] NOT NULL DEFAULT '{voice_agent,calendar,client_details,meeting_planner,sales,emailing}';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS plan_status TEXT NOT NULL DEFAULT 'active';

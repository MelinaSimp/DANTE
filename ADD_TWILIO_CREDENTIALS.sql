-- Add Twilio Credentials to Your Workspace
-- Run this in Supabase SQL Editor

-- First, find your workspace_id
-- Replace 'your-workspace-name' with your actual workspace name or user ID
-- Or use this query to find it:

SELECT id, name, owner_id 
FROM workspaces 
WHERE owner_id = auth.uid()  -- Your workspace
LIMIT 1;

-- Once you have your workspace_id, run this:
-- Replace 'YOUR_WORKSPACE_ID' with your actual workspace_id from above
-- Replace 'YOUR_ACCOUNT_SID' with your Twilio Account SID (starts with AC...)
-- Replace 'YOUR_AUTH_TOKEN' with your Twilio Auth Token

INSERT INTO twilio_credentials (workspace_id, account_sid, auth_token)
VALUES (
  'YOUR_WORKSPACE_ID',  -- Replace with your workspace_id
  'YOUR_ACCOUNT_SID',   -- Replace with your Twilio Account SID (e.g., ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)
  'YOUR_AUTH_TOKEN'     -- Replace with your Twilio Auth Token
)
ON CONFLICT (workspace_id) 
DO UPDATE SET
  account_sid = EXCLUDED.account_sid,
  auth_token = EXCLUDED.auth_token,
  updated_at = NOW();

-- Verify the credentials were added
SELECT 
  workspace_id,
  account_sid,
  LEFT(auth_token, 4) || '...' as auth_token_preview,
  created_at,
  updated_at
FROM twilio_credentials
WHERE workspace_id = 'YOUR_WORKSPACE_ID';  -- Replace with your workspace_id

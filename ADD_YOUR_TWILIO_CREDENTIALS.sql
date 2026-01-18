-- Add Twilio Credentials for Your Workspace
-- Run this in Supabase SQL Editor

-- Step 1: First, find your workspace_id (run this first)
SELECT id, name, owner_id 
FROM workspaces 
WHERE owner_id = auth.uid()
LIMIT 1;

-- Step 2: Once you have your workspace_id, run this INSERT statement
-- Replace 'YOUR_WORKSPACE_ID' with the id from Step 1
-- Then uncomment and run:

/*
INSERT INTO twilio_credentials (workspace_id, account_sid, auth_token)
VALUES (
  'YOUR_WORKSPACE_ID',  -- Replace with your workspace_id from Step 1
  'ACa4ec1e738aa8dd41616222435045d6fb',  -- Your Account SID
  '6863bb19d773f6a119c66aa337d7c10b'    -- Your Auth Token
)
ON CONFLICT (workspace_id) 
DO UPDATE SET
  account_sid = EXCLUDED.account_sid,
  auth_token = EXCLUDED.auth_token,
  updated_at = NOW();
*/

-- Step 3: Verify the credentials were added
-- Replace 'YOUR_WORKSPACE_ID' with your workspace_id from Step 1
/*
SELECT 
  workspace_id,
  account_sid,
  LEFT(auth_token, 4) || '...' as auth_token_preview,
  created_at,
  updated_at
FROM twilio_credentials
WHERE workspace_id = 'YOUR_WORKSPACE_ID';
*/

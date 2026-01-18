-- ============================================
-- FIX: Phone Number Workspace Mismatch
-- ============================================
-- Issue: Vapi account is under adharsh.narendrakumar101@gmail.com
--        but agent with phone number is in DemoClient@gmail.com's workspace
-- ============================================

-- Step 1: Check current situation
-- Shows which workspace has the agent with phone number +12163508215
SELECT 
  a.id as agent_id,
  a.name as agent_name,
  a.phone_number,
  a.status,
  a.workspace_id,
  w.name as workspace_name,
  w.owner_id as current_owner_id,
  u.email as current_owner_email
FROM agents a
JOIN workspaces w ON a.workspace_id = w.id
JOIN auth.users u ON w.owner_id = u.id
WHERE a.phone_number LIKE '%2163508215%'
   OR a.phone_number LIKE '%+12163508215%'
   OR a.phone_number LIKE '%12163508215%'
ORDER BY a.status DESC, a.created_at DESC;

-- Step 2: Find adharsh.narendrakumar101@gmail.com's workspace
SELECT 
  u.id as user_id,
  u.email,
  w.id as workspace_id,
  w.name as workspace_name,
  w.owner_id
FROM auth.users u
LEFT JOIN workspaces w ON w.owner_id = u.id
WHERE u.email = 'adharsh.narendrakumar101@gmail.com';

-- Step 3: Find DemoClient@gmail.com's workspace
SELECT 
  u.id as user_id,
  u.email,
  w.id as workspace_id,
  w.name as workspace_name,
  w.owner_id
FROM auth.users u
LEFT JOIN workspaces w ON w.owner_id = u.id
WHERE u.email = 'DemoClient@gmail.com';

-- ============================================
-- SOLUTION OPTION 1: Move agent to adharsh's workspace
-- ============================================
-- Run this ONLY if you want to move the agent to adharsh's workspace
-- Replace <ADHARSH_WORKSPACE_ID> and <AGENT_ID> with actual IDs from above queries

-- First, get the IDs (run Step 2 to find adharsh's workspace_id)
-- Then update the agent:
-- UPDATE agents 
-- SET workspace_id = '<ADHARSH_WORKSPACE_ID>'
-- WHERE id = '<AGENT_ID>';

-- ============================================
-- SOLUTION OPTION 2: Keep agent where it is, just verify
-- ============================================
-- If you want to keep using DemoClient's workspace, you should:
-- 1. Either change Vapi account to DemoClient@gmail.com
-- 2. Or ensure DemoClient@gmail.com has access to view the conversations

-- ============================================
-- VERIFICATION: Check conversations are in correct workspace
-- ============================================
-- After fixing, verify conversations are being created in the right place:
-- SELECT 
--   c.id as conversation_id,
--   c.agent_id,
--   c.workspace_id,
--   w.name as workspace_name,
--   u.email as workspace_owner_email,
--   c.created_at
-- FROM conversations c
-- JOIN workspaces w ON c.workspace_id = w.id
-- JOIN auth.users u ON w.owner_id = u.id
-- WHERE c.channel_id LIKE '%vapi%' OR c.modality = 'voice'
-- ORDER BY c.created_at DESC
-- LIMIT 10;

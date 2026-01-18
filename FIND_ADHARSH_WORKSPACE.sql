-- ============================================
-- FIND ADHARSH'S ACTUAL WORKSPACE ID
-- ============================================

-- Check which workspace ID belongs to adharsh
SELECT 
  w.id as workspace_id,
  w.name as workspace_name,
  u.email as owner_email,
  u.id as user_id
FROM workspaces w
JOIN auth.users u ON w.owner_id = u.id
WHERE u.email = 'adharsh.narendrakumar101@gmail.com';

-- Check if workspace fae09570-8b89-4048-9d28-0282004a0546 belongs to DemoClient
SELECT 
  w.id as workspace_id,
  w.name as workspace_name,
  u.email as owner_email,
  CASE 
    WHEN u.email = 'adharsh.narendrakumar101@gmail.com' THEN '✅ This is adharsh''s workspace'
    WHEN u.email = 'democlient@gmail.com' THEN '❌ This is DemoClient''s workspace (NOT adharsh!)'
    ELSE '❓ This belongs to: ' || u.email
  END as verification
FROM workspaces w
JOIN auth.users u ON w.owner_id = u.id
WHERE w.id = 'fae09570-8b89-4048-9d28-0282004a0546';

-- Check current agent workspace
SELECT 
  a.id as agent_id,
  a.name as agent_name,
  a.workspace_id as current_workspace_id,
  w.name as current_workspace_name,
  u.email as current_workspace_owner
FROM agents a
JOIN workspaces w ON a.workspace_id = w.id
JOIN auth.users u ON w.owner_id = u.id
WHERE a.id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d';

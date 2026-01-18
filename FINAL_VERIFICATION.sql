-- ============================================
-- FINAL VERIFICATION - Agent Move Complete
-- ============================================

-- Step 1: Verify the workspace_id belongs to adharsh
SELECT 
  '✅ WORKSPACE OWNERSHIP' as check_type,
  w.id as workspace_id,
  w.name as workspace_name,
  u.email as owner_email,
  CASE 
    WHEN u.email = 'adharsh.narendrakumar101@gmail.com' THEN '✅ CORRECT - This is adharsh''s workspace'
    ELSE '❌ WRONG - This workspace belongs to: ' || u.email
  END as verification
FROM workspaces w
JOIN auth.users u ON w.owner_id = u.id
WHERE w.id = '5bc2cc7d-6e37-444b-836a-5df378ba6334';

-- Step 2: Verify agent is now in adharsh's workspace
SELECT 
  '✅ AGENT LOCATION' as check_type,
  a.id as agent_id,
  a.name as agent_name,
  a.phone_number,
  a.status,
  w.name as workspace_name,
  u.email as workspace_owner_email,
  CASE 
    WHEN u.email = 'adharsh.narendrakumar101@gmail.com' THEN '✅ CORRECT - Agent is in adharsh''s workspace!'
    ELSE '❌ WRONG - Agent is in ' || u.email || '''s workspace'
  END as verification
FROM agents a
JOIN workspaces w ON a.workspace_id = w.id
JOIN auth.users u ON w.owner_id = u.id
WHERE a.id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d';

-- Step 3: Verify data sources are still attached
SELECT 
  '✅ DATA SOURCES' as check_type,
  COUNT(*) as data_source_count,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Data sources found - All good!'
    ELSE '❌ NO DATA SOURCES - They may have been deleted!'
  END as verification
FROM agent_data_sources
WHERE agent_id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d';

-- Step 4: CRITICAL - Verify agent status is 'deployed'
SELECT 
  '⚠️ AGENT STATUS' as check_type,
  status,
  CASE 
    WHEN status = 'deployed' THEN '✅ CORRECT - Agent is deployed (webhook will find it)'
    WHEN status = 'draft' THEN '❌ WRONG - Agent must be deployed for webhook to work!'
    ELSE '❓ UNKNOWN STATUS: ' || status
  END as verification
FROM agents
WHERE id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d';

-- Step 5: Complete final check
SELECT 
  '📊 FINAL STATUS' as check_type,
  a.name as agent_name,
  a.phone_number,
  a.status,
  w.name as workspace_name,
  u.email as workspace_owner,
  (SELECT COUNT(*) FROM agent_data_sources WHERE agent_id = a.id) as data_source_count,
  CASE 
    WHEN u.email = 'adharsh.narendrakumar101@gmail.com' 
         AND a.status = 'deployed' 
         AND (SELECT COUNT(*) FROM agent_data_sources WHERE agent_id = a.id) > 0
    THEN '✅✅✅ PERFECT - Ready to test calls!'
    WHEN u.email != 'adharsh.narendrakumar101@gmail.com'
    THEN '❌ Agent is in wrong workspace'
    WHEN a.status != 'deployed'
    THEN '❌ Agent is not deployed - Deploy it!'
    WHEN (SELECT COUNT(*) FROM agent_data_sources WHERE agent_id = a.id) = 0
    THEN '❌ No data sources found'
    ELSE '⚠️ Check individual steps above'
  END as final_status
FROM agents a
JOIN workspaces w ON a.workspace_id = w.id
JOIN auth.users u ON w.owner_id = u.id
WHERE a.id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d';

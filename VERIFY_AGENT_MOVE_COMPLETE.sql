-- ============================================
-- VERIFY AGENT MOVE TO ADHARSH'S WORKSPACE
-- ============================================

-- Step 1: Verify workspace ownership
-- This confirms the workspace ID belongs to adharsh
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
WHERE w.id = 'fae09570-8b89-4048-9d28-0282004a0546';

-- Step 2: Verify agent is in correct workspace
-- This confirms the agent moved successfully
SELECT 
  '✅ AGENT WORKSPACE' as check_type,
  a.id as agent_id,
  a.name as agent_name,
  a.phone_number,
  a.status,
  a.workspace_id,
  w.name as workspace_name,
  u.email as workspace_owner_email,
  CASE 
    WHEN u.email = 'adharsh.narendrakumar101@gmail.com' THEN '✅ CORRECT - Agent is in adharsh''s workspace'
    ELSE '❌ WRONG - Agent is in ' || u.email || '''s workspace'
  END as verification
FROM agents a
JOIN workspaces w ON a.workspace_id = w.id
JOIN auth.users u ON w.owner_id = u.id
WHERE a.id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d';

-- Step 3: Verify data sources are still attached
-- This confirms data sources didn't get deleted (they shouldn't - only CASCADE on DELETE)
SELECT 
  '✅ DATA SOURCES' as check_type,
  COUNT(*) as data_source_count,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Data sources found - Good!'
    ELSE '❌ NO DATA SOURCES - They may have been deleted!'
  END as verification
FROM agent_data_sources
WHERE agent_id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d';

-- Step 4: List all data sources (for verification)
SELECT 
  '📋 DATA SOURCE DETAILS' as check_type,
  id,
  name,
  type,
  CASE 
    WHEN type = 'text' THEN 'Has content: ' || CASE WHEN content IS NOT NULL AND content != '' THEN 'Yes' ELSE 'No' END
    WHEN type = 'file' THEN 'File URL: ' || COALESCE(file_url, 'MISSING')
    ELSE 'Unknown type'
  END as details
FROM agent_data_sources
WHERE agent_id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d'
ORDER BY created_at DESC;

-- Step 5: CRITICAL - Verify agent status is 'deployed'
-- If status is not 'deployed', the webhook won't find the agent!
SELECT 
  '⚠️ AGENT STATUS (CRITICAL)' as check_type,
  id,
  name,
  status,
  phone_number,
  CASE 
    WHEN status = 'deployed' THEN '✅ CORRECT - Agent is deployed (webhook will find it)'
    WHEN status = 'draft' THEN '❌ WRONG - Agent is in draft mode (webhook WON''T find it)'
    ELSE '❓ UNKNOWN STATUS - Check this!'
  END as verification
FROM agents
WHERE id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d';

-- Step 6: Verify phone number format
-- The webhook uses exact phone number matching, so format matters
SELECT 
  '📞 PHONE NUMBER FORMAT' as check_type,
  phone_number,
  CASE 
    WHEN phone_number = '+12163508215' THEN '✅ Format: +12163508215 (E.164)'
    WHEN phone_number = '12163508215' THEN '⚠️ Format: 12163508215 (missing +)'
    WHEN phone_number = '2163508215' THEN '⚠️ Format: 2163508215 (missing +1)'
    WHEN phone_number LIKE '%2163508215%' THEN '✅ Contains 2163508215 (should work)'
    ELSE '❓ Unknown format: ' || phone_number
  END as format_check
FROM agents
WHERE id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d';

-- Step 7: Complete summary check
SELECT 
  '📊 SUMMARY' as check_type,
  a.id as agent_id,
  a.name as agent_name,
  a.phone_number,
  a.status,
  w.name as workspace_name,
  u.email as workspace_owner,
  (SELECT COUNT(*) FROM agent_data_sources WHERE agent_id = a.id) as data_source_count,
  CASE 
    WHEN u.email = 'adharsh.narendrakumar101@gmail.com' AND a.status = 'deployed' AND (SELECT COUNT(*) FROM agent_data_sources WHERE agent_id = a.id) > 0
    THEN '✅ ALL CHECKS PASSED - Ready to test!'
    WHEN u.email != 'adharsh.narendrakumar101@gmail.com'
    THEN '❌ Agent is in wrong workspace'
    WHEN a.status != 'deployed'
    THEN '❌ Agent is not deployed'
    WHEN (SELECT COUNT(*) FROM agent_data_sources WHERE agent_id = a.id) = 0
    THEN '❌ No data sources found'
    ELSE '⚠️ SOME ISSUES - Check above'
  END as final_status
FROM agents a
JOIN workspaces w ON a.workspace_id = w.id
JOIN auth.users u ON w.owner_id = u.id
WHERE a.id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d';

-- ============================================
-- CHECK IF AGENT HAS SCENARIOS AND STEPS
-- ============================================

-- Step 1: Check agent exists and is deployed
SELECT 
  '✅ AGENT STATUS' as check_type,
  id,
  name,
  phone_number,
  status,
  workspace_id,
  CASE 
    WHEN status = 'deployed' THEN '✅ Agent is deployed'
    ELSE '❌ Agent is NOT deployed - Status: ' || status
  END as verification
FROM agents
WHERE id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d';

-- Step 2: Check if agent has scenarios
SELECT 
  '📋 SCENARIOS' as check_type,
  COUNT(*) as scenario_count,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Agent has ' || COUNT(*) || ' scenario(s)'
    ELSE '❌ NO SCENARIOS FOUND - Agent has no scenarios configured!'
  END as verification
FROM scenarios
WHERE agent_id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d';

-- Step 3: List all scenarios for this agent
SELECT 
  '📋 SCENARIO DETAILS' as check_type,
  id as scenario_id,
  name as scenario_name,
  description,
  sort_order,
  created_at
FROM scenarios
WHERE agent_id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d'
ORDER BY created_at ASC, sort_order ASC;

-- Step 4: Check if scenarios have steps
SELECT 
  '📝 STEPS PER SCENARIO' as check_type,
  s.id as scenario_id,
  s.name as scenario_name,
  COUNT(st.id) as step_count,
  CASE 
    WHEN COUNT(st.id) > 0 THEN '✅ Has ' || COUNT(st.id) || ' step(s)'
    ELSE '❌ NO STEPS - Scenario has no steps configured!'
  END as verification
FROM scenarios s
LEFT JOIN steps st ON st.scenario_id = s.id
WHERE s.agent_id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d'
GROUP BY s.id, s.name
ORDER BY s.created_at ASC;

-- Step 5: List all steps for the first scenario (the one that should be used)
SELECT 
  '📝 STEP DETAILS (First Scenario)' as check_type,
  st.id as step_id,
  st.name as step_name,
  st.type as step_type,
  st.sort_order,
  st.ai_message,
  CASE 
    WHEN st.type = 'say' AND (st.ai_message IS NULL OR st.ai_message = '') THEN '⚠️ Say step has no message'
    WHEN st.type = 'gather' THEN '✅ Gather step'
    WHEN st.type = 'qa' THEN '✅ Q/A step'
    WHEN st.type = 'if' THEN '✅ If step'
    ELSE '✅ ' || st.type || ' step'
  END as step_status
FROM scenarios s
JOIN steps st ON st.scenario_id = s.id
WHERE s.agent_id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d'
  AND s.id = (
    SELECT id FROM scenarios 
    WHERE agent_id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d'
    ORDER BY created_at ASC
    LIMIT 1
  )
ORDER BY st.sort_order ASC;

-- Step 6: Check recent conversations to see if scenarios are being used
SELECT 
  '💬 RECENT CONVERSATIONS' as check_type,
  c.id as conversation_id,
  c.agent_id,
  c.current_scenario_id,
  c.current_step_id,
  s.name as scenario_name,
  st.name as step_name,
  st.type as step_type,
  c.status,
  c.created_at,
  CASE 
    WHEN c.current_scenario_id IS NULL THEN '❌ No scenario assigned'
    WHEN c.current_step_id IS NULL THEN '⚠️ No step assigned'
    ELSE '✅ Has scenario and step'
  END as verification
FROM conversations c
LEFT JOIN scenarios s ON s.id = c.current_scenario_id
LEFT JOIN steps st ON st.id = c.current_step_id
WHERE c.agent_id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d'
  AND c.modality = 'voice'
ORDER BY c.created_at DESC
LIMIT 5;

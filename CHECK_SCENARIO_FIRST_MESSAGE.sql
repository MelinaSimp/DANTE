-- ============================================
-- CHECK IF AGENT HAS FIRST MESSAGE IN SCENARIO
-- ============================================

-- Step 1: Check if agent has scenarios
SELECT 
  '📋 SCENARIOS' as check_type,
  COUNT(*) as scenario_count,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Agent has ' || COUNT(*) || ' scenario(s)'
    ELSE '❌ NO SCENARIOS - Agent has no scenarios!'
  END as verification
FROM scenarios
WHERE agent_id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d';

-- Step 2: Get the first scenario (the one that should be used)
SELECT 
  '📋 FIRST SCENARIO' as check_type,
  id as scenario_id,
  name as scenario_name,
  description,
  sort_order,
  created_at
FROM scenarios
WHERE agent_id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d'
ORDER BY created_at ASC
LIMIT 1;

-- Step 3: Check first Say step in first scenario (the greeting message)
SELECT 
  '💬 FIRST SAY STEP (GREETING)' as check_type,
  s.id as scenario_id,
  s.name as scenario_name,
  st.id as step_id,
  st.name as step_name,
  st.type as step_type,
  st.sort_order,
  st.ai_message,
  CASE 
    WHEN st.ai_message IS NULL OR st.ai_message = '' THEN '❌ NO MESSAGE - Say step has no ai_message!'
    WHEN st.type != 'say' THEN '⚠️ FIRST STEP IS NOT SAY TYPE - Type: ' || st.type
    WHEN st.ai_message IS NOT NULL AND st.ai_message != '' THEN '✅ HAS MESSAGE: ' || LEFT(st.ai_message, 50) || '...'
    ELSE '❓ UNKNOWN'
  END as verification
FROM scenarios s
LEFT JOIN steps st ON st.scenario_id = s.id
WHERE s.agent_id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d'
  AND s.id = (
    SELECT id FROM scenarios 
    WHERE agent_id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d'
    ORDER BY created_at ASC
    LIMIT 1
  )
  AND st.type = 'say'
ORDER BY st.sort_order ASC
LIMIT 1;

-- Step 4: If no Say step, check what the first step is
SELECT 
  '📝 FIRST STEP IN SCENARIO' as check_type,
  s.id as scenario_id,
  s.name as scenario_name,
  st.id as step_id,
  st.name as step_name,
  st.type as step_type,
  st.sort_order,
  st.ai_message,
  CASE 
    WHEN st.type = 'say' THEN '✅ First step is Say step'
    WHEN st.type = 'gather' THEN '⚠️ First step is Gather - No greeting!'
    WHEN st.type = 'qa' THEN '⚠️ First step is Q/A - No greeting!'
    ELSE '⚠️ First step is ' || st.type || ' - Might not work as greeting'
  END as verification
FROM scenarios s
JOIN steps st ON st.scenario_id = s.id
WHERE s.agent_id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d'
  AND s.id = (
    SELECT id FROM scenarios 
    WHERE agent_id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d'
    ORDER BY created_at ASC
    LIMIT 1
  )
ORDER BY st.sort_order ASC
LIMIT 1;

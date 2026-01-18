-- ============================================
-- CHECK RECENT CONVERSATION FOR SCENARIO
-- ============================================

-- Check the most recent conversation for this agent
SELECT 
  '💬 RECENT CONVERSATION' as check_type,
  c.id as conversation_id,
  c.agent_id,
  c.channel_id as vapi_call_id,
  c.current_scenario_id,
  c.current_step_id,
  s.name as scenario_name,
  st.name as step_name,
  st.type as step_type,
  c.status,
  c.created_at,
  c.updated_at,
  CASE 
    WHEN c.current_scenario_id IS NULL THEN '❌ NO SCENARIO - Conversation created without scenario!'
    WHEN c.current_step_id IS NULL THEN '⚠️ NO STEP - Conversation has scenario but no step'
    WHEN c.current_scenario_id IS NOT NULL AND c.current_step_id IS NOT NULL THEN '✅ HAS SCENARIO AND STEP'
    ELSE '❓ UNKNOWN'
  END as verification
FROM conversations c
LEFT JOIN scenarios s ON s.id = c.current_scenario_id
LEFT JOIN steps st ON st.id = c.current_step_id
WHERE c.agent_id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d'
  AND c.modality = 'voice'
ORDER BY c.created_at DESC
LIMIT 1;

-- Check ALL recent conversations
SELECT 
  c.id,
  c.channel_id,
  c.current_scenario_id,
  c.current_step_id,
  s.name as scenario_name,
  st.name as step_name,
  c.created_at
FROM conversations c
LEFT JOIN scenarios s ON s.id = c.current_scenario_id
LEFT JOIN steps st ON st.id = c.current_step_id
WHERE c.agent_id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d'
  AND c.modality = 'voice'
ORDER BY c.created_at DESC
LIMIT 5;

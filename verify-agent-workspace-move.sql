-- Verify the agent move was successful
-- Check if agent is now in adharsh's workspace

-- 1. Verify workspace ownership
SELECT 
  w.id as workspace_id,
  w.name as workspace_name,
  u.email as owner_email,
  u.id as owner_id
FROM workspaces w
JOIN auth.users u ON w.owner_id = u.id
WHERE w.id = 'fae09570-8b89-4048-9d28-0282004a0546';

-- 2. Verify agent is in the correct workspace
SELECT 
  a.id as agent_id,
  a.name as agent_name,
  a.phone_number,
  a.status,
  a.workspace_id,
  w.name as workspace_name,
  u.email as workspace_owner_email
FROM agents a
JOIN workspaces w ON a.workspace_id = w.id
JOIN auth.users u ON w.owner_id = u.id
WHERE a.id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d';

-- 3. Verify data sources still exist (they should - CASCADE doesn't delete on UPDATE)
SELECT 
  ads.id,
  ads.name,
  ads.type,
  ads.agent_id,
  a.name as agent_name,
  w.name as workspace_name,
  u.email as workspace_owner_email
FROM agent_data_sources ads
JOIN agents a ON ads.agent_id = a.id
JOIN workspaces w ON a.workspace_id = w.id
JOIN auth.users u ON w.owner_id = u.id
WHERE ads.agent_id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d';

-- 4. Count data sources
SELECT 
  COUNT(*) as data_source_count
FROM agent_data_sources
WHERE agent_id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d';

-- 5. Verify agent status is 'deployed' (CRITICAL for webhook to work)
SELECT 
  id,
  name,
  status,
  phone_number,
  workspace_id
FROM agents
WHERE id = '9f02c164-16e3-436d-9ec1-02bb3a01f81d';

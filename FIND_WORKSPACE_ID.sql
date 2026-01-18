-- Find Your Workspace ID - Try these queries in order

-- Method 1: Check your profile (most reliable)
SELECT 
  id as user_id,
  workspace_id,
  email
FROM profiles
WHERE id = auth.uid()
LIMIT 1;

-- Method 2: Find workspace from your agents (like "Sproda")
SELECT DISTINCT
  a.id as agent_id,
  a.name as agent_name,
  a.workspace_id
FROM agents a
WHERE a.name = 'Sproda'
  AND a.status = 'deployed'
LIMIT 1;

-- Method 3: List all workspaces you have access to
SELECT 
  w.id as workspace_id,
  w.name as workspace_name,
  w.owner_id,
  p.email as owner_email
FROM workspaces w
LEFT JOIN profiles p ON p.id = w.owner_id
ORDER BY w.created_at DESC
LIMIT 10;

-- Method 4: Find workspace from any deployed agent
SELECT DISTINCT
  workspace_id,
  COUNT(*) as agent_count
FROM agents
WHERE status = 'deployed'
GROUP BY workspace_id
ORDER BY agent_count DESC
LIMIT 5;

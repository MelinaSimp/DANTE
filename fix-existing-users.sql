-- Fix existing users who don't have workspaces
-- Run this in your Supabase SQL editor

-- Create workspaces for users who don't have them
INSERT INTO workspaces (name, owner_id)
SELECT 
  CONCAT(SPLIT_PART(u.email, '@', 1), '''s Workspace') as name,
  p.id as owner_id
FROM profiles p
JOIN auth.users u ON p.id = u.id
WHERE p.workspace_id IS NULL;

-- Update profiles to link them to their workspaces
UPDATE profiles 
SET workspace_id = w.id
FROM workspaces w
WHERE profiles.id = w.owner_id 
  AND profiles.workspace_id IS NULL;

-- Verify the fix worked
SELECT 
  p.id,
  u.email,
  p.full_name,
  p.workspace_id,
  w.name as workspace_name
FROM profiles p
JOIN auth.users u ON p.id = u.id
LEFT JOIN workspaces w ON p.workspace_id = w.id
ORDER BY u.created_at DESC;

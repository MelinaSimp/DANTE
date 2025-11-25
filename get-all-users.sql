-- Get all users with their emails and workspace IDs
-- Run this in your Supabase SQL editor

SELECT 
  p.id as user_id,
  u.email,
  p.full_name,
  p.role,
  p.is_superadmin,
  p.workspace_id,
  w.name as workspace_name,
  u.created_at as signed_up_at
FROM profiles p
LEFT JOIN auth.users u ON p.id = u.id
LEFT JOIN workspaces w ON p.workspace_id = w.id
ORDER BY u.created_at DESC;


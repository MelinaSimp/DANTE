-- Force make yourself a superadmin (bypasses RLS)
-- Run this in your Supabase SQL editor

-- First, let's see what's in your profile
SELECT 
  id,
  full_name,
  is_superadmin,
  role,
  workspace_id,
  created_at,
  updated_at
FROM profiles 
WHERE id = '58eab022-243d-469a-8188-561cb71cb5bc';

-- If the above shows your profile, then run this UPDATE:
UPDATE profiles 
SET 
  is_superadmin = true, 
  role = 'owner',
  updated_at = NOW()
WHERE id = '58eab022-243d-469a-8188-561cb71cb5bc';

-- Verify the change worked
SELECT 
  id,
  full_name,
  is_superadmin,
  role,
  workspace_id
FROM profiles 
WHERE id = '58eab022-243d-469a-8188-561cb71cb5bc';

-- If the UPDATE still doesn't work, try this INSERT/UPDATE approach:
INSERT INTO profiles (id, full_name, role, is_superadmin, workspace_id, created_at, updated_at)
VALUES (
  '58eab022-243d-469a-8188-561cb71cb5bc',
  'adharsh.narendrakumar101',
  'owner',
  true,
  'a969d7d6-ae60-497a-82ce-dcb5359ccb2b',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  is_superadmin = EXCLUDED.is_superadmin,
  role = EXCLUDED.role,
  updated_at = EXCLUDED.updated_at;

-- Final verification
SELECT 
  id,
  full_name,
  is_superadmin,
  role,
  workspace_id
FROM profiles 
WHERE id = '58eab022-243d-469a-8188-561cb71cb5bc';

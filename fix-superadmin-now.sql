-- Fix superadmin status for adharsh.narendrakumar101@gmail.com
-- Run this in Supabase SQL Editor

-- First, verify the current status
SELECT 
  u.id,
  u.email,
  p.is_superadmin,
  p.role,
  p.full_name
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE u.email = 'adharsh.narendrakumar101@gmail.com';

-- Update the profile to set is_superadmin = true
UPDATE profiles 
SET 
  is_superadmin = true, 
  role = 'owner',
  updated_at = NOW()
WHERE id IN (
  SELECT id FROM auth.users 
  WHERE email = 'adharsh.narendrakumar101@gmail.com'
);

-- If the UPDATE doesn't work (profile might not exist), use INSERT/UPDATE
INSERT INTO profiles (id, is_superadmin, role, full_name, workspace_id, created_at, updated_at)
SELECT 
  u.id,
  true as is_superadmin,
  'owner' as role,
  COALESCE(u.raw_user_meta_data->>'full_name', SPLIT_PART(u.email, '@', 1)) as full_name,
  NULL as workspace_id,
  NOW() as created_at,
  NOW() as updated_at
FROM auth.users u
WHERE u.email = 'adharsh.narendrakumar101@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = u.id)
ON CONFLICT (id) DO UPDATE SET
  is_superadmin = EXCLUDED.is_superadmin,
  role = EXCLUDED.role,
  updated_at = NOW();

-- Verify the change worked
SELECT 
  u.id,
  u.email,
  p.is_superadmin,
  p.role,
  p.full_name,
  CASE 
    WHEN p.is_superadmin = true AND LOWER(u.email) = 'adharsh.narendrakumar101@gmail.com' 
    THEN '✅ Superadmin Access Enabled'
    ELSE '❌ Superadmin Access Disabled'
  END as status
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE u.email = 'adharsh.narendrakumar101@gmail.com';




-- Check your current superadmin status
-- Run this in Supabase SQL Editor to see your current status

-- Step 1: Find your user ID and email
SELECT 
  u.id,
  u.email,
  p.is_superadmin,
  p.full_name,
  p.role
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE u.email = 'adharsh.narendrakumar101@gmail.com';

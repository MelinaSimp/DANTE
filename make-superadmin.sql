-- Make a user a superadmin
-- Run this in your Supabase SQL editor

-- First, find your user ID by email (replace with your actual email)
SELECT 
  u.id,
  u.email,
  p.full_name,
  p.is_superadmin,
  p.role
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE u.email = 'your-email@example.com'; -- Replace with your email

-- Once you have your user ID, run this to make yourself a superadmin:
-- UPDATE profiles 
-- SET is_superadmin = true, role = 'owner'
-- WHERE id = 'your-user-id-here'; -- Replace with your actual user ID

-- Verify the change worked:
-- SELECT 
--   u.id,
--   u.email,
--   p.full_name,
--   p.is_superadmin,
--   p.role,
--   p.workspace_id
-- FROM auth.users u
-- LEFT JOIN profiles p ON u.id = p.id
-- WHERE u.email = 'your-email@example.com'; -- Replace with your email
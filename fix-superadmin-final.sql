-- Fix superadmin access - Run this in Supabase SQL Editor
-- This will force update your user to superadmin status

-- Step 1: Find your user ID (replace with your actual email)
SELECT id, email 
FROM auth.users 
WHERE email = 'adharsh.narendrakumar101@gmail.com';

-- Step 2: Force update your profile to superadmin (bypasses RLS)
UPDATE profiles 
SET is_superadmin = true, updated_at = NOW()
WHERE id = (SELECT id FROM auth.users WHERE email = 'adharsh.narendrakumar101@gmail.com');

-- Step 3: Verify the update worked
SELECT 
  id, 
  full_name, 
  is_superadmin, 
  role,
  updated_at
FROM profiles 
WHERE id = (SELECT id FROM auth.users WHERE email = 'adharsh.narendrakumar101@gmail.com');

-- Step 4: Also update the auth.users metadata (optional but recommended)
UPDATE auth.users 
SET raw_user_meta_data = raw_user_meta_data || '{"is_superadmin": true}'::jsonb
WHERE email = 'adharsh.narendrakumar101@gmail.com';

-- Success message
SELECT 'Superadmin status updated successfully!' as status;

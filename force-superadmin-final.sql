-- Step 1: Find your user ID and email
SELECT id, email 
FROM auth.users 
WHERE email = 'adharsh.narendrakumar101@gmail.com';

-- Step 2: Force update your profile to superadmin (bypasses RLS)
UPDATE profiles 
SET is_superadmin = true, updated_at = NOW()
WHERE id = '58eab022-243d-469a-8188-561cb71cb5bc';

-- Step 3: Verify the update worked
SELECT id, full_name, is_superadmin, updated_at
FROM profiles 
WHERE id = '58eab022-243d-469a-8188-561cb71cb5bc';

-- Step 4: Also update the auth.users metadata (optional but recommended)
UPDATE auth.users 
SET raw_user_meta_data = raw_user_meta_data || '{"is_superadmin": true}'::jsonb
WHERE id = '58eab022-243d-469a-8188-561cb71cb5bc';

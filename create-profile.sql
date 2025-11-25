-- Create profile for your user
-- Run this in your Supabase SQL editor

-- Create a profile for your user ID
INSERT INTO profiles (id, full_name, role, is_superadmin)
VALUES ('8a13d65b-2315-4972-b199-84bb87c7cdaa', 'anarendrakumar26', 'owner', true)
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  is_superadmin = EXCLUDED.is_superadmin;

-- Success message
SELECT 'Profile created successfully!' as status;

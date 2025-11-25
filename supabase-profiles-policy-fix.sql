-- Fix infinite recursion in profiles policies
-- Run this in your Supabase SQL editor

-- Drop all existing policies on profiles table
DROP POLICY IF EXISTS "Users can read their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Superadmins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Superadmins can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Superadmins can update profiles" ON profiles;

-- Create simpler policies that don't cause recursion
CREATE POLICY "Users can read their own profile" ON profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Allow all authenticated users to insert profiles (for new user signup)
CREATE POLICY "Authenticated users can insert profiles" ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow all authenticated users to read all profiles (temporarily for debugging)
CREATE POLICY "Authenticated users can read all profiles" ON profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Success message
SELECT 'Profiles policies fixed - no more infinite recursion!' as status;

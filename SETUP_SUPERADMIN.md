# Setup Superadmin Access

## Steps to Set Your Email as Superadmin

Your email is already configured in the code: `adharsh.narendrakumar101@gmail.com`

However, you need to set the `is_superadmin` flag in your database profile.

### Option 1: Using Supabase SQL Editor (Recommended)

1. **Go to your Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard
   - Select your project

2. **Open SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New query"

3. **Run this SQL query** (replace with your actual user ID if needed):

```sql
-- First, find your user ID by email
SELECT 
  u.id,
  u.email,
  p.is_superadmin,
  p.full_name
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE u.email = 'adharsh.narendrakumar101@gmail.com';

-- If the above shows your user, then run this UPDATE:
UPDATE profiles 
SET 
  is_superadmin = true, 
  role = 'owner',
  updated_at = NOW()
WHERE id IN (
  SELECT id FROM auth.users 
  WHERE email = 'adharsh.narendrakumar101@gmail.com'
);

-- Verify the change worked
SELECT 
  u.email,
  p.is_superadmin,
  p.role,
  p.full_name
FROM auth.users u
JOIN profiles p ON u.id = p.id
WHERE u.email = 'adharsh.narendrakumar101@gmail.com';
```

### Option 2: Using Supabase Dashboard (If you know your User ID)

1. **Go to Supabase Dashboard**
2. **Navigate to Table Editor → `profiles` table**
3. **Find your profile** (search by email or user ID)
4. **Edit the row:**
   - Set `is_superadmin` to `true`
   - Set `role` to `owner`
5. **Save**

### Option 3: If You Don't Have a Profile Yet

If you haven't signed up yet, you need to:

1. **Sign up** with `adharsh.narendrakumar101@gmail.com`
2. **Then run the SQL from Option 1** to set `is_superadmin = true`

### Verification

After setting `is_superadmin = true`:

1. **Log out** of the application (if logged in)
2. **Log back in** with `adharsh.narendrakumar101@gmail.com`
3. **Navigate to** `/admin` - you should see the Admin Dashboard
4. If you get redirected, the superadmin flag isn't set correctly

### Troubleshooting

**If you can't access `/admin`:**

1. Check that your email matches exactly: `adharsh.narendrakumar101@gmail.com`
2. Verify `is_superadmin = true` in the database
3. Check browser console for errors
4. Try logging out and back in

**If the SQL query doesn't work:**

- Make sure you're using the Supabase SQL Editor (not a client)
- Check that RLS policies allow the update (superadmins should have full access)
- Try using the service role key if needed

### Environment Variable (Optional)

You can also set a custom superadmin email via environment variable:

```env
SUPERADMIN_EMAIL=adharsh.narendrakumar101@gmail.com
```

This is optional - the default in the code is already set to your email.

---

## Quick Check Script

Run this in Supabase SQL Editor to check your current status:

```sql
SELECT 
  u.id,
  u.email,
  u.created_at as user_created,
  p.is_superadmin,
  p.role,
  p.full_name,
  p.workspace_id,
  CASE 
    WHEN p.is_superadmin = true AND LOWER(u.email) = 'adharsh.narendrakumar101@gmail.com' 
    THEN '✅ Superadmin Access Enabled'
    ELSE '❌ Superadmin Access Disabled'
  END as status
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE u.email = 'adharsh.narendrakumar101@gmail.com';
```




# Quick Fix: Storage Bucket Not Found

## The Problem
You're seeing "Bucket not found" errors when trying to preview PDFs. This means the `agent-files` storage bucket doesn't exist in your Supabase project.

## The Solution

### Step 1: Go to Supabase Dashboard
1. Open [supabase.com](https://supabase.com)
2. Sign in and select your project
3. Click **SQL Editor** in the left sidebar

### Step 2: Run This SQL Script

Copy and paste this into the SQL Editor and click **Run**:

```sql
-- Create storage bucket for agent files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agent-files',
  'agent-files',
  true, -- Public bucket
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'text/plain', 'application/json', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/jpg', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage policies (allow authenticated users to manage files)
DROP POLICY IF EXISTS "Users can upload files for their workspace agents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read files for their workspace agents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete files for their workspace agents" ON storage.objects;

CREATE POLICY "Users can upload files for their workspace agents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'agent-files' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM agents WHERE workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Users can read files for their workspace agents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'agent-files' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM agents WHERE workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Users can delete files for their workspace agents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'agent-files' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM agents WHERE workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  )
);
```

### Step 3: Verify the Bucket Was Created
1. In Supabase Dashboard, go to **Storage** → **Buckets**
2. You should see a bucket named **"agent-files"**
3. Make sure it shows as **Public** (green checkmark)

### Step 4: Fix Existing Files
Since the bucket didn't exist when you uploaded files, those files don't actually exist in storage:

1. **Delete the old entries:**
   - Go to Data Sources or Policies page
   - Click the **X** button on each PDF that shows "Bucket not found"
   - Confirm deletion

2. **Re-upload your PDFs:**
   - Drag and drop or click to upload your PDF files again
   - They should now work correctly!

## Alternative: Use the Full Setup Script

If you prefer, you can use the complete setup script from your project:
- File: `SETUP_STORAGE_FIXED.sql`
- Run it in Supabase SQL Editor

## Still Having Issues?

1. **Check bucket exists:**
   ```sql
   SELECT * FROM storage.buckets WHERE id = 'agent-files';
   ```

2. **Check bucket is public:**
   ```sql
   SELECT id, name, public FROM storage.buckets WHERE id = 'agent-files';
   ```
   Should show `public = true`

3. **Check policies:**
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE '%agent%';
   ```


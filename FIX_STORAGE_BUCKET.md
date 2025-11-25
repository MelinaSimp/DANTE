# Fix: "Bucket not found" Error

## ❌ Problem

You're seeing: `{"statusCode": "404","error": "Bucket not found", "message": "Bucket not found"}`

This happens because the Supabase Storage bucket for file uploads doesn't exist yet.

---

## ✅ Solution: Create the Storage Bucket

### Step 1: Go to Supabase

1. Go to your **Supabase Dashboard**: https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor** (in the left sidebar)

### Step 2: Run the Storage Setup Script

1. Click **"New query"**
2. Copy and paste this SQL:

```sql
-- Create storage bucket for agent files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agent-files',
  'agent-files',
  false, -- Private bucket
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'text/plain', 'application/json', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/jpg', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for agent-files bucket
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

3. Click **"Run"** (or press Cmd+Enter)

### Step 3: Verify

1. Go to **Storage** in Supabase (left sidebar)
2. You should see a bucket called **"agent-files"**
3. If you see it, you're done! ✅

---

## 🔄 After Setup

Once the bucket is created:

1. **Refresh your app** (or close and reopen Electron)
2. **Try uploading a file again** in Data Sources
3. **Try previewing the file** - it should work now!

---

## 📝 What This Does

- Creates a storage bucket called `agent-files`
- Sets 50MB file size limit
- Allows PDF, text, images, and other common file types
- Sets up security policies so users can only access their own workspace files

---

## 🆘 If You Still Get Errors

1. **Check Storage in Supabase:**
   - Go to Storage → Buckets
   - Make sure `agent-files` exists

2. **Check Policies:**
   - Go to Storage → Policies
   - Make sure the policies were created

3. **Try uploading a new file:**
   - Delete the old "Data Sources.pdf" entry
   - Upload a new file
   - It should work now

---

**That's it!** Once you run the SQL script, file uploads and previews will work.



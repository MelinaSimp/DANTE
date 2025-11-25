# Verify Storage Bucket Setup

## ✅ Quick Check: Is the Bucket Created?

### In Supabase Dashboard:

1. Go to **Storage** (left sidebar)
2. Click **Buckets**
3. Look for a bucket named **"agent-files"**

**If you see it:** ✅ Bucket exists - the issue is the old file
**If you DON'T see it:** ❌ Bucket wasn't created - run the SQL again

---

## 🔍 If Bucket Exists But File Still Doesn't Work

The file "Data Sources.pdf" was uploaded **before** the bucket existed, so:
- The database has a record of the file
- But the actual file was never stored (bucket didn't exist)
- The `file_url` points to a file that doesn't exist

### Solution:

1. **Delete the old file entry:**
   - In Data Sources page, find "Data Sources.pdf"
   - Click the **X** (delete) button
   - Confirm deletion

2. **Re-upload the file:**
   - Drag and drop the PDF again
   - Or click to browse and select it
   - This time it will work because the bucket exists!

3. **Test:**
   - Try previewing the newly uploaded file
   - It should work now!

---

## 🛠️ If Bucket Doesn't Exist

Run this SQL in Supabase SQL Editor:

```sql
-- Create storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agent-files',
  'agent-files',
  false,
  52428800,
  ARRAY['application/pdf', 'text/plain', 'application/json', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/jpg', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- Drop and recreate policies
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

Then verify in Storage → Buckets that "agent-files" appears.

---

## 📝 Summary

**The issue:** Old file uploaded before bucket existed = invalid file URL

**The fix:** Delete old entry + Re-upload file = works perfectly!

The bucket is set up correctly now, you just need to re-upload the file.



# Storage Setup Verification Checklist

## ✅ Issues Found and Fixed

### Issue 1: Missing Public Read Policy
**Problem:** The bucket is marked as `public = true`, but the RLS policies only allow `authenticated` users to read files. This means anonymous access (like loading PDFs in iframes) is blocked.

**Fix:** Added a public read policy in `SETUP_STORAGE_COMPLETE.sql`

### Issue 2: File Path Structure
**Verified:** ✅ Correct
- Format: `${agentId}/${category}/${timestamp}_${filename}`
- Example: `abc-123/data-sources/1764109655955_Data_Sources.pdf`

### Issue 3: Public URL Generation
**Verified:** ✅ Correct
- Uses `getPublicUrl()` which is correct for public buckets
- URL format: `https://[project].supabase.co/storage/v1/object/public/agent-files/[path]`

## 🔧 Complete Fix Steps

### Step 1: Run the Complete Storage Setup

Go to Supabase Dashboard → SQL Editor and run `SETUP_STORAGE_COMPLETE.sql`:

```sql
-- This will:
-- 1. Create/update the bucket (make sure it's public)
-- 2. Add PUBLIC read policy (critical for iframe access)
-- 3. Add authenticated user policies (for upload/delete)
```

### Step 2: Verify Bucket Configuration

Run this in Supabase SQL Editor:

```sql
-- Check bucket exists and is public
SELECT id, name, public, file_size_limit 
FROM storage.buckets 
WHERE id = 'agent-files';
-- Should show: public = true

-- Check policies exist
SELECT policyname, roles, cmd 
FROM pg_policies 
WHERE tablename = 'objects' 
AND schemaname = 'storage'
AND policyname LIKE '%agent%';
-- Should show 4 policies including "Public can read files from agent-files bucket"
```

### Step 3: Test Upload Flow

1. **Upload a test PDF:**
   - Go to Data Sources or Policies page
   - Upload a small test PDF
   - Check browser console for upload logs

2. **Verify file exists:**
   - Go to Supabase Dashboard → Storage → Files
   - Navigate to `agent-files` bucket
   - You should see your file in the folder structure: `[agent-id]/[category]/[filename]`

3. **Test public URL:**
   - Copy the file URL from the upload response
   - Open it in a new browser tab (incognito/private window)
   - Should load the PDF directly

### Step 4: Fix Existing Files

Since old files were uploaded before the bucket existed:

1. **Delete old entries:**
   - Delete all PDF entries showing errors
   - They don't exist in storage anyway

2. **Re-upload:**
   - Upload your PDFs again
   - They should now work correctly

## 🔍 What to Check Before Re-uploading

- [ ] Bucket exists: `agent-files` in Supabase Storage
- [ ] Bucket is public: Shows "Public" tag in Supabase UI
- [ ] Public read policy exists: Run the SQL check above
- [ ] Upload API works: Check browser console when uploading
- [ ] File appears in Storage: Verify in Supabase Dashboard
- [ ] Public URL works: Open URL in incognito window

## 🐛 If Still Not Working

1. **Check browser console** for upload errors
2. **Check Supabase Storage** → Files → agent-files bucket
3. **Test public URL** directly in browser
4. **Check RLS policies** are applied correctly
5. **Verify file path** matches what's stored in database

## 📝 Key Points

- **Public bucket** = files accessible via URL without auth
- **Public read policy** = required for anonymous access (iframes, direct links)
- **Authenticated policies** = required for upload/delete operations
- **File path** = must match between upload and database record


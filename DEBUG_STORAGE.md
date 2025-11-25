# Debug Storage Issue

## 🔍 What to Check

The file preview is still failing even after making the bucket public. Let's debug step by step:

### Step 1: Verify Bucket is Public

Run this in Supabase SQL Editor:

```sql
SELECT id, name, public, created_at 
FROM storage.buckets 
WHERE id = 'agent-files';
```

**Expected**: `public` should be `true`

If it's `false`, run:
```sql
UPDATE storage.buckets
SET public = true
WHERE id = 'agent-files';
```

### Step 2: Check File URL Format

The file URL should look like:
```
https://<your-project-ref>.supabase.co/storage/v1/object/public/agent-files/<agent-id>/data-sources/<timestamp>_<filename>
```

**Check in browser console:**
1. Open your app
2. Open browser DevTools (F12)
3. Go to Console tab
4. Click "Preview" on a file
5. Look for `[Preview]` log messages
6. Check what the `file_url` value is

### Step 3: Test File URL Directly

1. Copy the file URL from the console
2. Paste it directly in your browser
3. Does it load? Or do you get an error?

### Step 4: Check Supabase Storage UI

1. Go to Supabase Dashboard
2. Storage → agent-files bucket
3. Do you see files in the folder structure?
4. Try clicking on a file - does it open?

### Step 5: Check Upload Logs

1. Open browser DevTools → Network tab
2. Upload a new file
3. Check the `/api/upload` request
4. Look at the response - what URL is returned?
5. Check server logs (if running locally) for `[Upload]` messages

### Step 6: Verify File Actually Exists

Run this in Supabase SQL Editor:

```sql
SELECT 
  id,
  name,
  file_url,
  file_type,
  created_at
FROM agent_data_sources
WHERE type = 'file'
ORDER BY created_at DESC
LIMIT 5;
```

Then try accessing one of those URLs directly in your browser.

---

## 🐛 Common Issues

### Issue 1: Bucket Not Actually Public
- **Symptom**: 403 Forbidden or "Bucket not found"
- **Fix**: Make sure the SQL update actually ran and `public = true`

### Issue 2: Wrong URL Format
- **Symptom**: 404 Not Found
- **Fix**: Check that `getPublicUrl()` is generating the correct format

### Issue 3: File Never Uploaded
- **Symptom**: Database has entry but file doesn't exist in storage
- **Fix**: Delete the database entry and re-upload

### Issue 4: CORS Error
- **Symptom**: CORS error in console
- **Fix**: Check Supabase Storage CORS settings (should allow your domain)

---

## 📋 What to Report Back

Please share:
1. The file URL from the console logs
2. What happens when you paste that URL directly in browser
3. Whether you see files in Supabase Storage UI
4. The response from `/api/upload` when uploading a new file
5. Any errors in browser console

This will help pinpoint the exact issue!



# Fix Storage: Make Bucket Public for Reads

## 🔍 The Problem

Your bucket is **private** (`public: false`), but the frontend is trying to access files directly. Private buckets require authentication, which the browser can't provide directly.

## ✅ Solution: Make Bucket Public for Reads

### Option 1: Make Bucket Public (Easiest)

Run this SQL in Supabase SQL Editor:

```sql
-- Make the bucket public so files can be accessed directly
UPDATE storage.buckets
SET public = true
WHERE id = 'agent-files';
```

This allows anyone with the URL to read files (but only authenticated users can upload/delete based on policies).

### Option 2: Keep Private + Use Proxy Endpoint (More Secure)

Keep the bucket private and create a proxy endpoint that serves files with authentication. This is more secure but requires more code.

---

## 🚀 Quick Fix: Make It Public

1. **Go to Supabase SQL Editor**
2. **Run this:**
   ```sql
   UPDATE storage.buckets
   SET public = true
   WHERE id = 'agent-files';
   ```
3. **Refresh your app**
4. **Try previewing the file again**

---

## 🔒 Security Note

Making the bucket public means:
- ✅ Files are readable by anyone with the URL
- ✅ But only authenticated users can upload (policy protects this)
- ✅ Only authenticated users can delete (policy protects this)

If you need stricter security, we can implement a proxy endpoint instead.

---

**Try making it public first - that's the quickest fix!**



# Quick Steps: Add Your Twilio Credentials

## ✅ Your Twilio Credentials (already have them):
- **Account SID:** `ACa4ec1e738aa8dd41616222435045d6fb`
- **Auth Token:** `6863bb19d773f6a119c66aa337d7c10b`

---

## 🚀 Quick Steps:

### Step 1: Find Your Workspace ID
1. Go to **Supabase Dashboard** → Your Project → **SQL Editor**
2. Run this query:

```sql
SELECT id, name, owner_id 
FROM workspaces 
WHERE owner_id = auth.uid()
LIMIT 1;
```

3. **Copy the `id` value** (this is your `workspace_id`)

### Step 2: Add Credentials
1. In the **same SQL Editor**, run this (replace `YOUR_WORKSPACE_ID` with the id from Step 1):

```sql
INSERT INTO twilio_credentials (workspace_id, account_sid, auth_token)
VALUES (
  'YOUR_WORKSPACE_ID',  -- Replace with your workspace_id from Step 1
  'ACa4ec1e738aa8dd41616222435045d6fb',
  '6863bb19d773f6a119c66aa337d7c10b'
)
ON CONFLICT (workspace_id) 
DO UPDATE SET
  account_sid = EXCLUDED.account_sid,
  auth_token = EXCLUDED.auth_token,
  updated_at = NOW();
```

2. Click **Run**

### Step 3: Verify
Run this to check it worked (replace `YOUR_WORKSPACE_ID`):

```sql
SELECT 
  workspace_id,
  account_sid,
  LEFT(auth_token, 4) || '...' as auth_token_preview,
  created_at,
  updated_at
FROM twilio_credentials
WHERE workspace_id = 'YOUR_WORKSPACE_ID';
```

You should see your credentials listed! ✅

---

## 🎯 After Adding:

1. Go back to your app
2. Try deploying "Sproda" agent again
3. The warning should disappear! ✅
4. Voice calls should now work!

---

**Note:** The `ON CONFLICT` clause means if credentials already exist, it will update them instead of creating duplicates.

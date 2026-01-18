# How to Add Twilio Credentials

Since there's no settings/integrations page in the UI, you can add Twilio credentials directly via **Supabase SQL**.

---

## 🔑 Step 1: Get Your Twilio Credentials

1. Go to [Twilio Console](https://console.twilio.com)
2. Click on your account (top right)
3. Look for:
   - **Account SID** (starts with `AC...`)
   - **Auth Token** (click "View" to reveal it)

**Example:**
- Account SID: `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- Auth Token: `your_auth_token_here`

---

## 🗄️ Step 2: Find Your Workspace ID

1. Go to **Supabase Dashboard** → Your Project → **SQL Editor**
2. Run this query:

```sql
SELECT id, name, owner_id 
FROM workspaces 
WHERE owner_id = auth.uid()
LIMIT 1;
```

3. Copy the `id` value (this is your `workspace_id`)

---

## ✅ Step 3: Add Credentials via SQL

1. In **Supabase SQL Editor**, run this query:

```sql
INSERT INTO twilio_credentials (workspace_id, account_sid, auth_token)
VALUES (
  'YOUR_WORKSPACE_ID',  -- Replace with your workspace_id from Step 2
  'YOUR_ACCOUNT_SID',   -- Replace with your Twilio Account SID
  'YOUR_AUTH_TOKEN'     -- Replace with your Twilio Auth Token
)
ON CONFLICT (workspace_id) 
DO UPDATE SET
  account_sid = EXCLUDED.account_sid,
  auth_token = EXCLUDED.auth_token,
  updated_at = NOW();
```

2. Replace the placeholders:
   - `YOUR_WORKSPACE_ID` → Your workspace ID from Step 2
   - `YOUR_ACCOUNT_SID` → Your Twilio Account SID
   - `YOUR_AUTH_TOKEN` → Your Twilio Auth Token

3. Click **Run**

---

## ✅ Step 4: Verify Credentials Were Added

Run this query to verify:

```sql
SELECT 
  workspace_id,
  account_sid,
  LEFT(auth_token, 4) || '...' as auth_token_preview,
  created_at,
  updated_at
FROM twilio_credentials
WHERE workspace_id = 'YOUR_WORKSPACE_ID';  -- Replace with your workspace_id
```

You should see your credentials listed.

---

## 🎯 After Adding Credentials

1. **Go back to your agent** ("Sproda")
2. **Click "Deploy agent"** again
3. The warning should **disappear** ✅
4. Voice calls should now work!

---

## 🔒 Security Note

- Credentials are stored encrypted in Supabase
- They're scoped to your workspace only
- You can update them anytime by running the SQL again
- To remove them, delete from `twilio_credentials` table

---

## 📋 Quick SQL Script

I've created `ADD_TWILIO_CREDENTIALS.sql` with a ready-to-use script. Just replace the placeholders and run it!

# Fix Workspace/Email Mismatch - Step by Step Guide

## Current Situation
- **Vapi Account**: adharsh.narendrakumar101@gmail.com
- **Agent with Phone Number**: In DemoClient@gmail.com's workspace
- **Data Sources**: ✅ Already on DemoClient's agent (correct agent)

## Decision: Which Workspace Should Own the Agent?

You have 2 options:

### Option 1: Move Agent to adharsh's Workspace (Recommended)
**Pros:**
- Vapi account and agent ownership match
- adharsh can see all conversations
- Clear ownership structure

**Cons:**
- Need to move agent (and potentially data sources if they're duplicated)

### Option 2: Change Vapi Account to DemoClient@gmail.com
**Pros:**
- No app changes needed
- Quick fix

**Cons:**
- adharsh loses access to Vapi account
- Need new Vapi account under DemoClient email

---

## Option 1: Move Agent to adharsh's Workspace

### Step 1: Get Required IDs

Run this in Supabase SQL Editor:

```sql
-- Get adharsh's workspace ID
SELECT 
  u.id as user_id,
  u.email,
  w.id as workspace_id,
  w.name as workspace_name
FROM auth.users u
LEFT JOIN workspaces w ON w.owner_id = u.id
WHERE u.email = 'adharsh.narendrakumar101@gmail.com';

-- Get DemoClient's agent ID (the one with phone number +12163508215)
SELECT 
  a.id as agent_id,
  a.name as agent_name,
  a.phone_number,
  a.workspace_id as current_workspace_id,
  w.name as current_workspace_name
FROM agents a
JOIN workspaces w ON a.workspace_id = w.id
WHERE a.phone_number LIKE '%2163508215%'
   OR a.phone_number LIKE '%+12163508215%'
   OR a.phone_number LIKE '%12163508215%';
```

### Step 2: Move Agent (In Your App - Supabase SQL)

Replace `<ADHARSH_WORKSPACE_ID>` and `<AGENT_ID>` with values from Step 1:

```sql
-- Move agent to adharsh's workspace
UPDATE agents 
SET workspace_id = '<ADHARSH_WORKSPACE_ID>'
WHERE id = '<AGENT_ID>';

-- Verify the move
SELECT 
  a.id,
  a.name,
  a.phone_number,
  w.name as workspace_name,
  u.email as workspace_owner_email
FROM agents a
JOIN workspaces w ON a.workspace_id = w.id
JOIN auth.users u ON w.owner_id = u.id
WHERE a.id = '<AGENT_ID>';
```

### Step 3: Verify Data Sources Moved

Data sources should automatically move with the agent (via CASCADE), but verify:

```sql
-- Check data sources are still attached to agent
SELECT 
  ads.id,
  ads.name,
  ads.type,
  ads.agent_id,
  a.name as agent_name,
  w.name as workspace_name
FROM agent_data_sources ads
JOIN agents a ON ads.agent_id = a.id
JOIN workspaces w ON a.workspace_id = w.id
WHERE ads.agent_id = '<AGENT_ID>';
```

### Step 4: No Changes Needed in Vapi

✅ **Vapi configuration stays the same:**
- Server URL: `https://driftai.studio/api/vapi/webhook`
- Assistant ID: `8b192691-bcec-4f2c-b1e1-7d8a3133411f`
- Phone Number: Already linked to assistant

The webhook will automatically find the agent by phone number, so moving the agent to a different workspace doesn't break Vapi.

---

## Option 2: Change Vapi Account to DemoClient@gmail.com

### Step 1: Create New Vapi Account

1. Go to https://dashboard.vapi.ai
2. Sign up/log in with: `DemoClient@gmail.com`
3. Create new API key

### Step 2: Export Current Vapi Configuration

Get these values from current Vapi account (adharsh's):
- Assistant ID: `8b192691-bcec-4f2c-b1e1-7d8a3133411f`
- Phone Number ID: `c852fcce-4afc-48b3-aa2c-fe361b2b2ac9`
- Server URL: `https://driftai.studio/api/vapi/webhook`

### Step 3: Import/Configure in New Account (DemoClient)

**If Vapi allows account transfer:**
- Contact Vapi support to transfer assistant/phone number

**If not (manual reconfiguration):**
1. In DemoClient's Vapi account, create new assistant
2. Configure:
   - Server URL: `https://driftai.studio/api/vapi/webhook`
   - Voice: ElevenLabs, Voice ID `cgSgspJ2msm6clMCkdW9`
   - Model: gpt-4o
   - First Message Mode: `assistant-speaks-first`
   - First Message: (empty)
3. Import phone number from Twilio:
   - Phone Number: `+12163508215`
   - Link to new assistant
   - Server URL: `https://driftai.studio/api/vapi/webhook`

### Step 4: Update Vercel Environment Variable (If Using Vapi API)

If you have `VAPI_API_KEY` in Vercel:
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Update `VAPI_API_KEY` to DemoClient's new API key
3. Redeploy

---

## Recommended: Option 1 (Move Agent)

I recommend **Option 1** because:
1. ✅ No need to reconfigure Vapi
2. ✅ adharsh keeps ownership of Vapi account
3. ✅ Data sources already exist on the agent
4. ✅ Cleaner long-term structure

---

## After Fixing: Verify Everything Works

1. **Make a test call** to `+12163508215`
2. **Check Vercel logs** for:
   - `[Vapi] Call started (request-start)`
   - `[Vapi] Found agent: <agent_id> <agent_name>`
   - `[AgentExecutor] Loaded context: { dataSourcesCount: X }`
3. **Verify conversations** are created in correct workspace:
   ```sql
   SELECT 
     c.id,
     c.agent_id,
     w.name as workspace_name,
     u.email as workspace_owner_email,
     c.created_at
   FROM conversations c
   JOIN workspaces w ON c.workspace_id = w.id
   JOIN auth.users u ON w.owner_id = u.id
   WHERE c.modality = 'voice'
   ORDER BY c.created_at DESC
   LIMIT 5;
   ```

---

## Need Help?

If you run into issues:
1. Check Vercel logs for webhook errors
2. Verify agent is still "deployed" status after move
3. Confirm phone number format matches exactly (including +1)

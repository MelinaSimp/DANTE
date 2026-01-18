# Migrate Agent from DemoClient to adharsh - Complete Guide

## ⚠️ IMPORTANT: Before Deleting

Deleting the agent will **CASCADE DELETE**:
- ✅ Data sources (will need to recreate)
- ✅ Scenarios (will need to recreate)
- ✅ Steps (will need to recreate)
- ✅ Branches (will need to recreate)
- ✅ Policies (will need to recreate)
- ✅ Personalization settings (will need to recreate)

**Conversations will be preserved** (they're linked by agent_id but won't be deleted)

---

## Step 1: Export Agent Configuration (Backup)

Run this in Supabase SQL Editor to see what you have:

```sql
-- Get agent info
SELECT id, name, description, phone_number, status, modality, elevenlabs_voice_id
FROM agents
WHERE phone_number LIKE '%2163508215%' OR phone_number LIKE '%+12163508215%';

-- Get data sources (you'll need to recreate these)
SELECT id, name, type, content, file_url, file_type
FROM agent_data_sources
WHERE agent_id = '<AGENT_ID_FROM_ABOVE>';

-- Get scenarios
SELECT id, name, description, sort_order
FROM scenarios
WHERE agent_id = '<AGENT_ID_FROM_ABOVE>'
ORDER BY sort_order;

-- Get steps (you'll need scenario IDs from above)
SELECT id, scenario_id, type, name, sort_order, ai_message, selected_data_source_ids
FROM steps
WHERE scenario_id IN (
  SELECT id FROM scenarios WHERE agent_id = '<AGENT_ID_FROM_ABOVE>'
)
ORDER BY scenario_id, sort_order;

-- Get policies
SELECT * FROM agent_policies
WHERE agent_id = '<AGENT_ID_FROM_ABOVE>';

-- Get personalization
SELECT * FROM agent_personalization
WHERE agent_id = '<AGENT_ID_FROM_ABOVE>';
```

**Save these results** (screenshot or copy to a document) - you'll need them to recreate everything!

---

## Step 2: Delete Agent from DemoClient's Workspace

**In Supabase SQL Editor:**

```sql
-- First, verify which agent you're deleting
SELECT 
  a.id,
  a.name,
  a.phone_number,
  w.name as workspace_name,
  u.email as owner_email
FROM agents a
JOIN workspaces w ON a.workspace_id = w.id
JOIN auth.users u ON w.owner_id = u.id
WHERE a.phone_number LIKE '%2163508215%' OR a.phone_number LIKE '%+12163508215%';

-- ⚠️ DELETE THE AGENT (this will cascade delete related data)
-- Replace <AGENT_ID> with the ID from above query
DELETE FROM agents 
WHERE id = '<AGENT_ID>'
  AND phone_number LIKE '%2163508215%' OR phone_number LIKE '%+12163508215%';
```

**Or use the UI:**
1. Log in as `DemoClient@gmail.com`
2. Go to your agent builder
3. Find the agent with phone number `+12163508215`
4. Delete it

---

## Step 3: Get adharsh's Workspace ID

**In Supabase SQL Editor:**

```sql
SELECT 
  u.id as user_id,
  u.email,
  w.id as workspace_id,
  w.name as workspace_name
FROM auth.users u
LEFT JOIN workspaces w ON w.owner_id = u.id
WHERE u.email = 'adharsh.narendrakumar101@gmail.com';
```

**Save the workspace_id** - you'll need it!

---

## Step 4: Create New Agent in adharsh's Workspace

**Option A: Via UI (Recommended)**
1. Log in as `adharsh.narendrakumar101@gmail.com`
2. Go to agent builder
3. Create new agent:
   - **Name**: Same as before (or new name)
   - **Modality**: `voice` (or `multi-modal` if it was before)
   - **Phone Number**: `+12163508215` (EXACTLY the same format!)
   - **Status**: `deployed` (important!)
   - **ElevenLabs Voice ID**: Same as before (if you had one)

**Option B: Via SQL (if you prefer)**

```sql
-- Replace <ADHARSH_WORKSPACE_ID> with value from Step 3
INSERT INTO agents (
  workspace_id,
  name,
  modality,
  phone_number,
  status,
  elevenlabs_voice_id,
  description
)
VALUES (
  '<ADHARSH_WORKSPACE_ID>',
  'Your Agent Name',  -- Replace with actual name
  'voice',  -- or 'multi-modal'
  '+12163508215',  -- EXACTLY this format (or without +1, but match what Vapi uses)
  'deployed',  -- CRITICAL: Must be 'deployed'
  'cgSgspJ2msm6clMCkdW9',  -- Replace with actual voice ID or NULL
  NULL  -- Optional description
)
RETURNING id, name, phone_number, workspace_id;
```

**Save the new agent ID** - you'll need it!

---

## Step 5: Recreate Data Sources

**Via UI (Easiest):**
1. In adharsh's workspace, go to the new agent
2. Go to "Data Sources" tab
3. For each data source you saved in Step 1:
   - Click "Add Data Source"
   - **Type**: Same as before (text or file)
   - **Name**: Same as before
   - **Content/File**: Re-upload or paste same content
   - Save

**Via SQL (Advanced):**

```sql
-- Replace <NEW_AGENT_ID> with agent ID from Step 4
-- Replace other values with data from Step 1 backup
INSERT INTO agent_data_sources (
  agent_id,
  name,
  type,
  content,  -- For text type
  file_url,  -- For file type
  file_type
)
VALUES (
  '<NEW_AGENT_ID>',
  'Data Source Name',  -- From backup
  'text',  -- or 'file'
  'Content here...',  -- From backup (for text type)
  NULL,  -- Or file_url from backup (for file type)
  'text/plain'  -- Or file_type from backup
);
```

---

## Step 6: Recreate Scenarios and Steps

**Via UI (Recommended - Much Easier):**
1. In adharsh's workspace, go to the new agent
2. Create scenarios matching your backup (same names, same order)
3. Create steps within each scenario:
   - **Type**: Same as before (say, gather, qa, etc.)
   - **Order**: Same sort_order as backup
   - **Content**: Same ai_message from backup
   - **Data Sources**: Re-link the same data sources you recreated in Step 5

**Via SQL (Very Complex - Only if you have many steps):**
```sql
-- Create scenario first
INSERT INTO scenarios (agent_id, name, description, sort_order)
VALUES ('<NEW_AGENT_ID>', 'Scenario Name', 'Description', 0)
RETURNING id;

-- Then create steps for that scenario
INSERT INTO steps (scenario_id, type, name, sort_order, ai_message, selected_data_source_ids)
VALUES 
  ('<SCENARIO_ID>', 'say', 'Greeting', 0, 'Hello!', NULL),
  ('<SCENARIO_ID>', 'gather', 'Get Info', 1, 'What can I help with?', NULL);
-- ... repeat for all steps
```

---

## Step 7: Recreate Policies and Personalization (If You Had Any)

**Via UI:**
1. Go to agent settings
2. Recreate any policies you had
3. Recreate personalization settings

**Via SQL:**
```sql
-- Policies
INSERT INTO agent_policies (agent_id, policy_text)
VALUES ('<NEW_AGENT_ID>', 'Your policy text...');

-- Personalization
INSERT INTO agent_personalization (agent_id, ...)
VALUES ('<NEW_AGENT_ID>', ...);
```

---

## Step 8: Verify Configuration

**Critical Checks:**

1. **Phone Number Format:**
   ```sql
   SELECT id, name, phone_number, status, workspace_id
   FROM agents
   WHERE workspace_id = '<ADHARSH_WORKSPACE_ID>'
     AND phone_number LIKE '%2163508215%';
   ```
   - Must match EXACTLY what Vapi sends (usually `+12163508215`)

2. **Agent Status:**
   - Must be `deployed` (not `draft`)

3. **Data Sources:**
   ```sql
   SELECT COUNT(*) as data_source_count
   FROM agent_data_sources
   WHERE agent_id = '<NEW_AGENT_ID>';
   ```
   - Should match count from Step 1 backup

---

## Step 9: Test

1. **Make a test call** to `+12163508215`
2. **Check Vercel logs** for:
   - `[Vapi] Call started (request-start)`
   - `[Vapi] Found agent: <NEW_AGENT_ID> <agent_name>`
   - `[AgentExecutor] Loaded context: { dataSourcesCount: X }` (should be > 0)
   - `[Q/A] Loaded X total agent data sources` (when Q/A step executes)

3. **Verify conversation created:**
   ```sql
   SELECT c.id, c.agent_id, w.name as workspace_name, u.email as owner_email
   FROM conversations c
   JOIN agents a ON c.agent_id = a.id
   JOIN workspaces w ON a.workspace_id = w.id
   JOIN auth.users u ON w.owner_id = u.id
   WHERE c.modality = 'voice'
   ORDER BY c.created_at DESC
   LIMIT 1;
   ```
   - Should show adharsh's workspace

---

## ⚠️ Common Pitfalls to Avoid

1. **Phone number format mismatch**: 
   - Vapi might send `+12163508215` or `12163508215` or `2163508215`
   - Check Vercel logs to see exact format Vapi sends
   - Use EXACTLY that format in your agent

2. **Agent not deployed**: 
   - Status must be `deployed` (webhook filters by this)

3. **Missing data sources**: 
   - Verify count matches backup
   - Check file URLs are still valid (if file type)

4. **Scenarios/Steps order wrong**: 
   - Sort order must match original
   - First scenario is used automatically

---

## ✅ Success Checklist

- [ ] Agent deleted from DemoClient's workspace
- [ ] Agent created in adharsh's workspace
- [ ] Phone number matches EXACTLY (check Vercel logs)
- [ ] Agent status is `deployed`
- [ ] All data sources recreated
- [ ] All scenarios recreated
- [ ] All steps recreated (with correct order)
- [ ] Test call works
- [ ] Vercel logs show data sources loading
- [ ] Conversation created in adharsh's workspace

---

## 🆘 If Something Goes Wrong

**Agent not found:**
- Check phone number format in Vercel logs
- Verify agent status is `deployed`
- Check agent is in adharsh's workspace

**Data sources not loading:**
- Verify data sources are linked to new agent ID
- Check file URLs are accessible (if file type)
- Verify data sources have content (not empty)

**Conversations in wrong workspace:**
- Agent is still in DemoClient's workspace (check workspace_id)

# Find Your Workspace ID - Alternative Methods

Since the first query returned no rows, try these methods:

---

## Method 1: Check Your Profile (Most Reliable)

Run this in Supabase SQL Editor:

```sql
SELECT 
  id as user_id,
  workspace_id,
  email
FROM profiles
WHERE id = auth.uid()
LIMIT 1;
```

This should show your `workspace_id` directly from your profile!

---

## Method 2: Find from Your "Sproda" Agent

Since you have a "Sproda" agent, we can find the workspace from it:

```sql
SELECT DISTINCT
  a.id as agent_id,
  a.name as agent_name,
  a.workspace_id
FROM agents a
WHERE a.name = 'Sproda'
  AND a.status = 'deployed'
LIMIT 1;
```

This will show the `workspace_id` that "Sproda" belongs to.

---

## Method 3: List All Workspaces

If you have access to multiple workspaces:

```sql
SELECT 
  w.id as workspace_id,
  w.name as workspace_name,
  w.owner_id,
  p.email as owner_email
FROM workspaces w
LEFT JOIN profiles p ON p.id = w.owner_id
ORDER BY w.created_at DESC
LIMIT 10;
```

Pick the one that matches your account.

---

## Method 4: Find from Any Deployed Agent

```sql
SELECT DISTINCT
  workspace_id,
  COUNT(*) as agent_count
FROM agents
WHERE status = 'deployed'
GROUP BY workspace_id
ORDER BY agent_count DESC
LIMIT 5;
```

This shows which workspace has the most deployed agents.

---

## 🎯 Quick Action

**Start with Method 1** - it's the most reliable! Run it and copy the `workspace_id` value.

Then use that `workspace_id` in the INSERT statement from the previous guide.

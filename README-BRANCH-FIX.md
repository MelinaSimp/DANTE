# Fix for Branch Block Creation Error

## Problem
When trying to create a branch block, you're getting this error:
```
new row for relation "steps" violates check constraint "steps_type_check"
```

## Solution
The database constraint doesn't include "branch", "call", or "trigger" as valid step types.

## Steps to Fix

1. Go to your Supabase dashboard
2. Navigate to SQL Editor
3. Run this SQL:

```sql
-- Drop the existing constraint
ALTER TABLE steps DROP CONSTRAINT IF EXISTS steps_type_check;

-- Add the constraint with all step types including branch, call, and trigger
ALTER TABLE steps ADD CONSTRAINT steps_type_check 
  CHECK (type IN ('trigger', 'say', 'gather', 'code', 'api_call', 'schedule', 'qa', 'loop', 'send_sms', 'transfer', 'branch', 'call'));

-- Verify the constraint was updated
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'steps'::regclass
  AND conname = 'steps_type_check';
```

4. After running this, try creating a branch block again - it should work!

The SQL file is also saved as: `fix-add-branch-call-trigger-types.sql`


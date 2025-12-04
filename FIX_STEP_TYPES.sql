-- FIX: Update existing step types before applying new constraint
-- Run this BEFORE the main migration

-- Step 1: Check what step types exist (for debugging)
SELECT type, COUNT(*) as count 
FROM steps 
GROUP BY type;

-- Step 2: Update 'if' steps to 'gather' (they'll use branches instead)
-- This is safe because 'if' steps are being replaced with branches on gather/qa steps
UPDATE steps 
SET type = 'gather'
WHERE type = 'if';

-- Step 3: If there are any other invalid types, update them to 'say' as a safe default
-- (You can customize this based on what you find in Step 1)
UPDATE steps 
SET type = 'say'
WHERE type NOT IN ('say', 'gather', 'code', 'api_call', 'schedule', 'qa', 'loop', 'send_sms', 'transfer');

-- Step 4: Verify all steps now have valid types
SELECT type, COUNT(*) as count 
FROM steps 
GROUP BY type;



-- Migration: Add 'qa' step type to steps table
-- Run this in your Supabase SQL editor

-- Drop the existing constraint
ALTER TABLE steps
DROP CONSTRAINT IF EXISTS steps_type_check;

-- Recreate the constraint with 'qa' included
ALTER TABLE steps
ADD CONSTRAINT steps_type_check 
CHECK (type IN ('say', 'gather', 'code', 'api_call', 'if', 'schedule', 'qa'));

-- Verify the constraint was updated
SELECT conname, pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'steps'::regclass
  AND conname = 'steps_type_check';




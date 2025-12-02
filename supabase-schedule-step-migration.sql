-- Migration: Add 'schedule' step type to steps table
-- Run this in your Supabase SQL editor to enable Schedule steps

-- Update the CHECK constraint to include 'schedule'
ALTER TABLE steps
DROP CONSTRAINT IF EXISTS steps_type_check;

ALTER TABLE steps
ADD CONSTRAINT steps_type_check 
CHECK (type IN ('say', 'gather', 'code', 'api_call', 'if', 'schedule'));

-- Verify the change
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'steps'::regclass
  AND conname = 'steps_type_check';










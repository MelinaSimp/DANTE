-- Migration: Add check_schedule step type
-- Run this migration in Supabase SQL editor

-- Update step type constraint to include 'check_schedule'
ALTER TABLE steps DROP CONSTRAINT IF EXISTS steps_type_check;
ALTER TABLE steps ADD CONSTRAINT steps_type_check 
  CHECK (type IN ('trigger', 'say', 'gather', 'code', 'api_call', 'schedule', 'check_schedule', 'qa', 'loop', 'send_sms', 'transfer', 'branch', 'call'));

-- Verify the constraint was updated
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'steps'::regclass
  AND conname = 'steps_type_check';




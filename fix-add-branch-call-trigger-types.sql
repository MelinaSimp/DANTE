-- Fix: Add branch, call, and trigger step types to the database constraint
-- Run this in your Supabase SQL editor

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


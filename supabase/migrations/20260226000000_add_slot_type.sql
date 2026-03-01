-- Add slot_type column to availability_slots for categorized open slots
ALTER TABLE availability_slots ADD COLUMN IF NOT EXISTS slot_type TEXT NOT NULL DEFAULT 'General';

CREATE INDEX IF NOT EXISTS idx_availability_slots_type
  ON availability_slots(workspace_id, slot_type);

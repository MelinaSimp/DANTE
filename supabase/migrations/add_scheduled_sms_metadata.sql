-- Add metadata column to scheduled_sms table for storing Google Calendar event info
ALTER TABLE scheduled_sms 
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Add index for metadata queries
CREATE INDEX IF NOT EXISTS idx_scheduled_sms_metadata ON scheduled_sms USING GIN (metadata);


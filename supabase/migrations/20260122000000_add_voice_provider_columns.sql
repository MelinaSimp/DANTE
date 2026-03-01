-- Add VAPI voice provider support columns to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS voice_provider TEXT NOT NULL DEFAULT 'custom';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS vapi_assistant_id TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS vapi_phone_number_id TEXT;

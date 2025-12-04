-- Migration: Add ElevenLabs voice support to agents table
-- Run this in your Supabase SQL editor

-- Add elevenlabs_voice_id column to agents table
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS elevenlabs_voice_id TEXT;

-- Add comment for documentation
COMMENT ON COLUMN agents.elevenlabs_voice_id IS 'ElevenLabs voice ID for text-to-speech. If null, uses Twilio default voice.';

-- Success message
SELECT 'ElevenLabs voice column added to agents table!' as status;





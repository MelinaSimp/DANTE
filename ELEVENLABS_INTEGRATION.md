# ElevenLabs Voice Integration

## Overview
This integration replaces Twilio's default text-to-speech voices with ElevenLabs' high-quality, human-like voices. Customers can now choose custom voices for their AI receptionist agents.

## Setup

### 1. Database Migration
Run the SQL migration to add the `elevenlabs_voice_id` column to the agents table:
```sql
-- See: supabase-elevenlabs-voice-migration.sql
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS elevenlabs_voice_id TEXT;
```

### 2. Environment Variables
Add your ElevenLabs API key to your environment variables:
```bash
ELEVENLABS_API_KEY=your_api_key_here
```

### 3. How It Works

1. **Voice Selection**: When editing an agent (voice or multi-modal), customers can select an ElevenLabs voice from a dropdown
2. **Audio Generation**: When the agent speaks, text is sent to ElevenLabs API to generate audio
3. **Audio Caching**: Generated audio is cached in memory for 1 hour to reduce API calls
4. **Twilio Integration**: Instead of using Twilio's `<Say>` tag, we use `<Play>` tag with the generated audio URL

## API Endpoints

### `POST /api/elevenlabs/generate-audio`
Generates audio from text using ElevenLabs API.

**Request:**
```json
{
  "text": "Hello, how can I help you?",
  "voiceId": "voice_id_here"
}
```

**Response:**
```json
{
  "audioUrl": "/api/elevenlabs/audio/cache_key",
  "cacheKey": "cache_key"
}
```

### `GET /api/elevenlabs/audio/[cacheKey]`
Serves cached audio files.

### `GET /api/elevenlabs/voices`
Returns list of available ElevenLabs voices.

**Response:**
```json
{
  "voices": [
    {
      "voice_id": "abc123",
      "name": "Rachel"
    },
    ...
  ]
}
```

## Usage

1. **Select Voice**: Edit an agent → Select a voice from the dropdown (only shown for voice/multi-modal agents)
2. **Automatic**: Once selected, all agent speech will use the selected ElevenLabs voice
3. **Fallback**: If no voice is selected or audio generation fails, falls back to Twilio's default "alice" voice

## Technical Details

- Audio is generated on-demand when the agent speaks
- Generated audio is cached in memory (max 100 entries, 1 hour TTL)
- Audio URLs are served via `/api/elevenlabs/audio/[cacheKey]`
- Twilio `<Play>` tag is used instead of `<Say>` when ElevenLabs voice is configured
- All existing Twilio webhook endpoints have been updated to support ElevenLabs

## Notes

- Audio generation adds ~1-2 seconds latency per message
- For production, consider using Redis or a database for audio caching instead of in-memory
- Consider pre-generating common phrases for faster response times







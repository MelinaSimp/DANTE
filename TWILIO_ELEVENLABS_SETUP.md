# Complete Setup Guide: Twilio + ElevenLabs Voice Receptionist

## ✅ What You Already Have

1. **Twilio SDK** - `twilio@^5.10.2` ✅
2. **OpenAI SDK** - `openai@^5.22.0` ✅
3. **Basic Twilio Integration** - Webhooks set up ✅
4. **Supabase** - Database and storage ✅

## 📦 What You Need to Install

### 1. ElevenLabs SDK
```bash
npm install elevenlabs
```

### 2. Audio Processing Libraries (for Media Streams)
```bash
npm install ws @types/ws
npm install bufferutil utf-8-validate
```

### 3. Optional: Audio Utilities
```bash
npm install @ffmpeg/ffmpeg @ffmpeg/util  # For audio conversion if needed
```

---

## 🔑 Environment Variables Required

Add these to your `.env.local` file:

```env
# Twilio (Required)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890  # Your Twilio phone number

# ElevenLabs (Required)
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM  # Default voice (Rachel) - change as needed

# OpenAI (Already have)
OPENAI_API_KEY=sk-...

# Supabase (Already have)
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Webhook URLs (Required for Twilio)
PUBLIC_BASE_URL=https://your-domain.vercel.app
APP_BASE_URL=https://your-domain.vercel.app

# Optional: For call recordings
SUPABASE_STORAGE_BUCKET=call-recordings
```

---

## 🎯 What You Need to Set Up

### 1. **ElevenLabs Account** ⚠️ REQUIRED
- Sign up at [elevenlabs.io](https://elevenlabs.io)
- Get your API key from dashboard
- Choose a voice (or use default: Rachel - `21m00Tcm4TlvDq8ikWAM`)
- **Cost**: ~$0.30 per 1000 characters
- **Free tier**: 10,000 characters/month

### 2. **Twilio Account Setup** ⚠️ REQUIRED
- Get Account SID and Auth Token from [Twilio Console](https://console.twilio.com)
- Purchase a phone number
- Configure webhooks:
  - **Voice & Fax** → **A CALL COMES IN**: `https://your-domain.vercel.app/api/twilio/incoming`
  - **STATUS CALLBACK URL**: `https://your-domain.vercel.app/api/twilio/status`
  - **Enable Media Streams** (for real-time streaming)

### 3. **Supabase Storage Bucket** ⚠️ REQUIRED (for recordings)
- Create bucket: `call-recordings`
- Set to private (or public if you want)
- Configure RLS policies

### 4. **Vercel Environment Variables** ⚠️ REQUIRED
- Add all environment variables to Vercel dashboard
- Redeploy after adding variables

---

## 📁 Files You Need to Create

### 1. ElevenLabs TTS Client
**File**: `/lib/tts/elevenlabs.ts`

```typescript
import { ElevenLabsClient } from "elevenlabs";

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY!,
});

export async function textToSpeech(
  text: string,
  voiceId: string = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"
): Promise<Buffer> {
  const audio = await client.textToSpeech.convert(voiceId, {
    text,
    model_id: "eleven_multilingual_v2", // or "eleven_monolingual_v1"
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
    },
  });

  const chunks: Uint8Array[] = [];
  for await (const chunk of audio) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}
```

### 2. Media Stream Handler (WebSocket)
**File**: `/app/api/twilio/media-stream/route.ts`

This handles real-time audio streaming from Twilio Media Streams.

### 3. Audio Upload to Supabase
**File**: `/lib/storage/audio-upload.ts`

For storing TTS audio files and call recordings.

---

## 🛠️ Implementation Checklist

### Phase 1: Basic Setup (Day 1)
- [ ] Install ElevenLabs SDK
- [ ] Install WebSocket libraries
- [ ] Add environment variables
- [ ] Create ElevenLabs TTS client
- [ ] Test TTS generation

### Phase 2: Integration (Day 2-3)
- [ ] Replace Twilio `<Say>` with ElevenLabs audio
- [ ] Upload audio to Supabase Storage
- [ ] Stream audio via TwiML `<Play>`
- [ ] Test end-to-end voice call

### Phase 3: Real-Time Streaming (Day 4-5)
- [ ] Set up Media Streams webhook
- [ ] Create WebSocket handler
- [ ] Process audio chunks in real-time
- [ ] Implement interrupt handling

### Phase 4: Production (Day 6-7)
- [ ] Error handling & fallbacks
- [ ] Audio caching for common phrases
- [ ] Call recording integration
- [ ] Monitoring & logging

---

## 💰 Cost Breakdown

### Per 5-minute call:
- **Twilio**: ~$0.065 (5 min × $0.013/min)
- **ElevenLabs**: ~$0.50 (assuming ~1500 characters spoken)
- **OpenAI**: ~$0.15 (AI responses)
- **Total**: ~$0.70-0.80 per call

### Monthly (100 calls/day):
- **Twilio**: ~$195/month
- **ElevenLabs**: ~$1,500/month
- **OpenAI**: ~$450/month
- **Total**: ~$2,145/month

### Cost Optimization:
- Cache common phrases (greetings, confirmations)
- Use shorter AI responses
- Consider Azure TTS for non-critical calls ($0.015/1k chars)

---

## 🔧 Quick Start Commands

```bash
# Install dependencies
npm install elevenlabs ws @types/ws bufferutil utf-8-validate

# Add to .env.local
echo "ELEVENLABS_API_KEY=your_key_here" >> .env.local
echo "ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM" >> .env.local

# Test ElevenLabs (create test file)
# Create: /app/api/test-elevenlabs/route.ts
```

---

## 📚 Resources

- [ElevenLabs API Docs](https://elevenlabs.io/docs)
- [Twilio Media Streams](https://www.twilio.com/docs/voice/twiml/stream)
- [Twilio TwiML Reference](https://www.twilio.com/docs/voice/twiml)
- [Supabase Storage](https://supabase.com/docs/guides/storage)

---

## ⚠️ Important Notes

1. **ElevenLabs Rate Limits**:
   - Free tier: 10,000 chars/month
   - Paid: Based on subscription
   - Monitor usage in dashboard

2. **Twilio Media Streams**:
   - Requires WebSocket support
   - Next.js API routes support WebSockets
   - May need Vercel Pro for better WebSocket handling

3. **Audio Format**:
   - ElevenLabs outputs MP3 by default
   - Twilio accepts MP3, WAV, PCM
   - May need conversion for optimal quality

4. **Caching Strategy**:
   - Cache common phrases (greetings, confirmations)
   - Store in Supabase Storage
   - Reuse across calls to save costs

---

## 🚀 Next Steps

1. **Install packages** (run commands above)
2. **Get API keys** (ElevenLabs + verify Twilio)
3. **Set environment variables** (add to .env.local and Vercel)
4. **Create TTS client** (I can help with this)
5. **Integrate with existing Twilio webhooks** (I can help with this)

Would you like me to:
- Create the ElevenLabs TTS client?
- Update the Twilio webhooks to use ElevenLabs?
- Set up Media Streams for real-time streaming?
- Create the audio upload/storage system?












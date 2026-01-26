# Debugging STT (Speech-to-Text) Issue

## 🔍 Current Problem
Voice agent speaks greeting but doesn't respond to user questions. STT is returning empty transcriptions.

## 📊 What to Check

### 1. **Railway Logs** (Most Important - Shows STT API Results)

**Go to Railway Dashboard:**
1. Navigate to your service → **Deploy Logs**
2. Make a test call
3. **Look for these log entries:**

```
[Media Stream] 📝 STT result: "(empty)"
[Media Stream] 🔍 Debug info: {"rms":"XX.XX","threshold":50,"audioLength":XXXX}
[Media Stream] 🔍 Audio RMS was XX.XX, threshold is 50
```

**What to look for:**
- **RMS values**: If RMS is consistently below 50, audio is being detected as silence
- **Audio length**: Should be ~16000+ bytes when processing
- **API call timing**: How long STT API calls take

**If RMS is low (< 50):**
- Audio might actually be silence
- User might not be speaking loud enough
- Microphone might not be working
- Audio format conversion might be wrong

**If RMS is high (> 50) but still empty:**
- Whisper API might be receiving malformed audio
- WAV file format might be incorrect
- Need to check Vercel logs

### 2. **Vercel Logs** (Shows STT Processing Details)

**Go to Vercel Dashboard:**
1. Navigate to: https://vercel.com/drift4/drift-crm/logs
2. Filter by: **Function** = `/api/twilio/media-stream-process`
3. Make a test call
4. **Look for these log entries:**

```
[Media Stream Process] Decoding XXXX bytes of mulaw audio...
[Media Stream Process] Decoded to XXXX PCM 8kHz samples
[Media Stream Process] Audio RMS: XX.XX (threshold: 50)
[Media Stream Process] Upsampled to XXXX PCM 16kHz samples
[Media Stream Process] Created WAV file: XXXX bytes (PCM 16kHz 16-bit mono)
[Media Stream Process] 📤 Sending XXXX bytes to Whisper API...
[Media Stream Process] ⏱️  Whisper API call took XXXms, status: 200
[Media Stream Process] ✅ Whisper API success. Transcribed: "..."
```

**What to look for:**
- **RMS values**: Should match what Railway logs show
- **WAV file size**: Should be reasonable (not 0 or tiny)
- **Whisper API status**: Should be 200 (not 400/500)
- **Whisper API response time**: Should be < 5 seconds
- **Transcribed text**: Should show actual text, not empty

**If Whisper returns 400/500:**
- Check the error message in logs
- WAV file format might be wrong
- Audio might be corrupted

**If Whisper returns 200 but empty text:**
- Audio might be actual silence (check RMS)
- Audio might be too short
- Audio might be corrupted in a way Whisper can't detect

### 3. **Check Audio Processing Timing**

**In Railway logs, look for:**
```
[Media Stream] 📊 Processing audio: XXXX bytes, XXXXms since last process
[Media Stream] ⏱️  STT API call took XXXXms
```

**What to check:**
- Are audio chunks being processed? (Should see "Processing audio" logs)
- How long between processing? (Should be ~2-3 seconds)
- Is the 3-second greeting delay working? (Should wait 3s after greeting)

### 4. **Check if Agent Speaking Flag is Working**

**In Railway logs, look for:**
- No "Processing audio" logs while agent is speaking (good)
- "Processing audio" logs after agent finishes (good)
- If you see processing during greeting, the flag isn't working

## 🔧 Potential Issues & Fixes

### Issue 1: Silence Detection Too Aggressive
**Symptom**: RMS values are 20-50, audio is being filtered as silence
**Fix**: Lower threshold from 50 to 20-30 in `app/api/twilio/media-stream-process/route.ts`

### Issue 2: Audio Format Conversion Wrong
**Symptom**: RMS is high but Whisper returns empty
**Fix**: Check mulaw decoding - verify `alawmulaw` library is working correctly

### Issue 3: WAV File Format Incorrect
**Symptom**: Whisper returns 400 error
**Fix**: Verify WAV header is correct (44 bytes, proper RIFF/WAVE format)

### Issue 4: Audio Too Short
**Symptom**: Whisper returns empty for short utterances
**Fix**: Increase minimum buffer size (currently 16000 bytes = ~2 seconds)

### Issue 5: User Not Speaking Loud Enough
**Symptom**: RMS consistently low, actual silence
**Fix**: Not a code issue - user needs to speak louder or check microphone

## 📋 What I Need From You

Please provide:
1. **Railway logs** showing:
   - STT result messages
   - Debug info (RMS values)
   - Audio processing messages

2. **Vercel logs** showing:
   - STT processing steps
   - Whisper API responses
   - Any error messages

3. **Test call details**:
   - Did you speak clearly?
   - How long did you wait after greeting?
   - What did you say?

This will help identify exactly where the issue is!

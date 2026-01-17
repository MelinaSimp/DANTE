# Update Twilio Webhook Configuration

## 🔧 What to Change

You need to update your Twilio phone number configuration to point to the new Media Streams endpoint instead of Vapi.

### Current Configuration (WRONG):
- **A call comes in:** `https://api.vapi.ai/twilio/inbound_call`
- **Primary handler fails:** `https://api.vapi.ai/twilio/inbound_call`

### New Configuration (CORRECT):
- **A call comes in:** `https://driftai.studio/api/twilio/media-stream`
- **Primary handler fails:** `https://driftai.studio/api/twilio/incoming` (fallback)

---

## 📝 Step-by-Step Instructions

1. **Go to Twilio Console**
   - Navigate to: **Phone Numbers** → **Manage** → **Active numbers**
   - Click on your phone number

2. **Update "A call comes in" webhook:**
   - Change from: `https://api.vapi.ai/twilio/inbound_call`
   - Change to: `https://driftai.studio/api/twilio/media-stream`
   - Method: **HTTP POST**

3. **Update "Primary handler fails" webhook:**
   - Change from: `https://api.vapi.ai/twilio/inbound_call`
   - Change to: `https://driftai.studio/api/twilio/incoming`
   - Method: **HTTP POST**
   - (This is a fallback if Media Streams fails)

4. **Keep "Call status changes" as is:**
   - URL: `https://driftai.studio/api/twilio/status`
   - Method: **HTTP POST**

5. **Click "Save"** at the bottom of the page

---

## ✅ Verification

After updating:
1. Make a test call to your Twilio number
2. Check Vercel logs for `[Media Stream]` entries
3. The call should connect to Railway WebSocket server (or fallback to regular Twilio flow)

---

## 🗑️ Vapi Status

**Vapi is deprecated** - We're now using:
- ✅ **Twilio Media Streams** (for low-latency real-time audio)
- ✅ **Railway WebSocket Server** (for bidirectional audio streaming)
- ✅ **ElevenLabs** (for text-to-speech)

The Vapi webhook (`/api/vapi/webhook`) still exists in the codebase but is no longer used.

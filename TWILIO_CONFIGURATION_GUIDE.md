# Twilio Configuration for Media Streams

## Current Issue

Your Twilio phone number is configured to use Vapi's webhook:
- **Current**: `https://api.vapi.ai/twilio/inbound_call` ❌
- **Should be**: `https://driftai.studio/api/twilio/incoming` ✅

## Step-by-Step Configuration

### 1. Change the Webhook URL

**In Twilio Console:**
1. You're already on the "Configure" tab for phone number (216) 350-8215
2. Find **"A call comes in"** section
3. Change the **URL** from:
   ```
   https://api.vapi.ai/twilio/inbound_call
   ```
   To:
   ```
   https://driftai.studio/api/twilio/incoming
   ```
4. Keep **HTTP method** as: `HTTP POST`
5. **Save**

### 2. Enable Media Streams (Optional - for ultra-low latency)

Media Streams is enabled in the TwiML response, not in phone number settings.

**Important**: We need to update the incoming webhook to enable Media Streams in the TwiML response.

**The incoming webhook should return TwiML like this:**
```xml
<Response>
  <Start>
    <Stream url="wss://motivated-perfection-production.up.railway.app/media-stream" />
  </Start>
  <Say>Hello! How can I help you today?</Say>
  <Gather input="speech" method="POST" ...>
  </Gather>
</Response>
```

## Next Steps

1. **Change webhook URL** (Step 1 above)
2. **Update incoming webhook** to enable Media Streams (I'll help with this)
3. **Test the call**

Let me update the incoming webhook code to enable Media Streams!

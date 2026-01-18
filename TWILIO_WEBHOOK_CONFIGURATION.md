# Twilio Webhook Configuration - Step by Step

## Current Configuration (WRONG)

Your Twilio phone number is pointing to **Vapi's webhook**:
- URL: `https://api.vapi.ai/twilio/inbound_call` ❌

## Correct Configuration

### Step 1: Change Webhook URL

**In Twilio Console (where you are now):**

1. **Find "A call comes in" section** (in Voice Configuration)
2. **Change the URL from:**
   ```
   https://api.vapi.ai/twilio/inbound_call
   ```
   **To:**
   ```
   https://driftai.studio/api/twilio/incoming
   ```
3. **Keep HTTP method**: `HTTP POST`
4. **Click "Save"** (at the bottom of the page)

### Step 2: That's It! (For Now)

The webhook is now configured. The incoming webhook will handle:
- Creating conversations
- Executing agent steps
- Generating responses
- Using your data sources ✅

### Step 3: Enable Media Streams (After Railway is Fixed)

Once the Railway build is fixed, we'll update the incoming webhook to enable Media Streams for ultra-low latency (200-500ms).

**Note**: Media Streams is enabled in the TwiML response (code), not in phone number settings. We'll update the code after Railway is working.

## Summary

**Change this:**
- ❌ `https://api.vapi.ai/twilio/inbound_call`
- ✅ `https://driftai.studio/api/twilio/incoming`

**Then click "Save"!**

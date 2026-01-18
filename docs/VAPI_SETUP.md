# Vapi AI Setup Guide

This guide explains how to set up Vapi AI for voice calls while keeping Twilio for SMS.

---

## 📋 Overview

**Hybrid Approach:**
- **Voice Calls**: Vapi AI (low-latency, uses ElevenLabs voices)
- **SMS**: Twilio (unchanged, all SMS functionality remains)

---

## 🚀 Step 1: Create Vapi Account

1. Go to [Vapi.ai](https://vapi.ai)
2. Sign up for an account
3. Complete account setup

---

## 🔑 Step 2: Get Your Vapi API Key

1. Go to Vapi Dashboard → **Settings** → **API Keys**
2. Create a new API key or copy existing one
3. Save it securely (you'll need it for environment variables)

---

## 📞 Step 3: Import Your Twilio Phone Numbers

### Option A: Import Existing Twilio Numbers (Recommended)

1. In Vapi Dashboard, go to **Phone Numbers**
2. Click **"Import Phone Number"** or **"Add Number"**
3. Select **"Import from Twilio"**
4. Enter your Twilio credentials:
   - **Twilio Account SID**: Your Twilio Account SID
   - **Twilio Auth Token**: Your Twilio Auth Token
   - **Phone Number**: The phone number you want to import (e.g., `+12163508215`)
5. **Important**: Make sure **"SMS Enabled"** is **UNCHECKED** (we're keeping SMS with Twilio)
6. Click **"Import"**

### Option B: Use Vapi's Phone Numbers

1. In Vapi Dashboard, go to **Phone Numbers**
2. Click **"Buy Number"** or **"Add Number"**
3. Select a phone number
4. Complete purchase

**Note**: If you use Vapi's numbers, you'll need to update your agent's `phone_number` field in the database to match.

---

## 🎙️ Step 4: Configure ElevenLabs in Vapi

1. In Vapi Dashboard, go to **Settings** → **Integrations**
2. Find **ElevenLabs** section
3. Enter your **ElevenLabs API Key**
   - Get your key from [ElevenLabs Dashboard](https://elevenlabs.io/app/settings/api-keys)
4. Click **"Save"** or **"Connect"**

**Important**: When you use an ElevenLabs voice in Vapi, the costs are billed directly to your ElevenLabs account (not through Vapi).

---

## 🤖 Step 5: Create Vapi Assistant

1. In Vapi Dashboard, go to **Assistants**
2. Click **"Create Assistant"** or **"New Assistant"**
3. Configure the assistant:

   **Basic Settings:**
   - **Name**: Your agent's name (e.g., "Drift Receptionist")
   - **First Message**: Leave empty (we'll handle this via webhook)
   - **Model**: Choose your preferred model (e.g., "gpt-4o-mini")

   **Voice Settings:**
   - **Provider**: Select **"ElevenLabs"**
   - **Voice**: Select the ElevenLabs voice ID that matches your agent's `elevenlabs_voice_id`
     - You can find your voice IDs in your ElevenLabs account
     - Or use the voice ID from your agent configuration in Drift

   **Server URL (CRITICAL):**
   - **Server URL**: `https://your-domain.com/api/vapi/webhook`
     - Replace `your-domain.com` with your actual domain
     - For Vercel deployments: `https://your-app.vercel.app/api/vapi/webhook`
     - For custom domain: `https://driftai.studio/api/vapi/webhook`

   **Other Settings:**
   - **Interruptions**: Enable (allows users to interrupt the AI)
   - **Silence Timeout**: 500ms (recommended for low latency)
   - **Response Delay**: 0ms (for fastest responses)

4. Click **"Save"** or **"Create"**

---

## 🔗 Step 6: Link Phone Number to Assistant

1. In Vapi Dashboard, go to **Phone Numbers**
2. Find your imported/purchased phone number
3. Click on it to edit
4. Under **"Assistant"**, select the assistant you created in Step 5
5. **Important**: Make sure **"SMS"** is **DISABLED** (we're keeping SMS with Twilio)
6. Click **"Save"**

---

## 🔧 Step 7: Configure Environment Variables

Add these environment variables to your Vercel project (or `.env.local` for local development):

```bash
# Vapi Configuration
VAPI_API_KEY=your_vapi_api_key_here

# ElevenLabs (still needed - Vapi uses this)
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# Twilio (still needed for SMS)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token

# OpenAI (still needed for agent logic)
OPENAI_API_KEY=your_openai_api_key
```

**To add in Vercel:**
1. Go to your Vercel project
2. **Settings** → **Environment Variables**
3. Add each variable
4. Make sure to enable for **Production**, **Preview**, and **Development**
5. **Redeploy** your application

---

## ✅ Step 8: Verify Agent Configuration

In your Drift CRM application:

1. Go to **GigaAI** → Select your agent
2. Go to **Advanced** tab
3. Verify:
   - **Phone Number**: Matches the number you imported/configured in Vapi
   - **ElevenLabs Voice ID**: Matches the voice ID configured in your Vapi assistant
4. Make sure agent is **Deployed** (status should be "Deployed")

---

## 🧪 Step 9: Test Voice Calls

1. **Call your phone number** (the one configured in Vapi)
2. You should hear:
   - The greeting from your agent's first "Say" step
   - The AI responding to your questions
   - Natural conversation flow

3. **Check Vercel Logs**:
   - Go to Vercel Dashboard → Your Project → **Logs**
   - Look for `[Vapi]` log entries
   - Verify webhook is being called correctly

4. **Check Vapi Dashboard**:
   - Go to **Calls** in Vapi Dashboard
   - You should see your test call
   - Check call details and logs

---

## 🔍 Troubleshooting

### Issue: "Agent not found for this phone number"

**Solution:**
- Verify the phone number in your agent's **Advanced** settings matches exactly the number in Vapi
- Check phone number format (should include country code, e.g., `+12163508215`)
- Try normalizing the phone number (remove spaces, dashes)

### Issue: "Conversation not found"

**Solution:**
- This usually means the call started but the conversation wasn't created
- Check Vercel logs for errors during conversation creation
- Verify database connection is working

### Issue: Voice doesn't match ElevenLabs voice

**Solution:**
- Verify the `elevenlabs_voice_id` in your agent matches the voice ID in Vapi assistant settings
- Check that ElevenLabs API key is configured in Vapi
- Make sure the voice ID exists in your ElevenLabs account

### Issue: High latency

**Solution:**
- Check Vapi assistant settings:
  - **Response Delay**: Set to 0ms
  - **Silence Timeout**: Set to 500ms
- Verify your webhook endpoint is responding quickly
- Check Vercel logs for slow database queries

### Issue: SMS not working

**Solution:**
- SMS should still work through Twilio (unchanged)
- Verify Twilio webhook is still configured for SMS: `/api/twilio/sms`
- Check that SMS is **disabled** in Vapi (we want SMS to go through Twilio)

---

## 📊 Monitoring

### Vapi Dashboard
- **Calls**: View all voice calls, duration, status
- **Analytics**: Call metrics, latency, success rates

### Vercel Logs
- Look for `[Vapi]` prefixed logs
- Monitor webhook response times
- Check for errors

### Database
- Check `conversations` table for voice conversations
- Verify `channel_id` contains Vapi call IDs (not Twilio CallSids)
- Monitor conversation status and transcripts

---

## 🔄 Migration Checklist

- [ ] Vapi account created
- [ ] Vapi API key obtained
- [ ] Twilio numbers imported to Vapi (or Vapi numbers purchased)
- [ ] ElevenLabs configured in Vapi
- [ ] Vapi assistant created with correct voice
- [ ] Server URL configured in Vapi assistant
- [ ] Phone number linked to assistant
- [ ] SMS disabled in Vapi (keep with Twilio)
- [ ] Environment variables added to Vercel
- [ ] Agent phone number verified in Drift
- [ ] Test call completed successfully
- [ ] SMS still works (test separately)

---

## 📝 Notes

1. **SMS Unchanged**: All SMS functionality remains with Twilio. The `/api/twilio/sms` endpoint is still active and unchanged.

2. **Voice Only**: Vapi is only used for voice calls. SMS, appointment reminders, and scheduled SMS all still use Twilio.

3. **Costs**: 
   - Vapi: Infrastructure/platform costs
   - ElevenLabs: Billed directly to your ElevenLabs account (when using ElevenLabs voices)
   - Twilio: SMS costs only (voice costs removed)

4. **Backward Compatibility**: Old Twilio voice endpoints are deprecated but kept for reference. They won't be called for new voice calls.

---

## 🆘 Support

If you encounter issues:

1. Check Vercel logs for `[Vapi]` entries
2. Check Vapi Dashboard → Calls for call details
3. Verify all environment variables are set correctly
4. Test webhook endpoint directly (see Vapi webhook testing tools)
5. Check that agent is deployed and phone number matches

---

## 📚 Additional Resources

- [Vapi Documentation](https://docs.vapi.ai)
- [Vapi Webhook Reference](https://docs.vapi.ai/server/overview)
- [ElevenLabs API Documentation](https://docs.elevenlabs.io)
- [Twilio SMS Documentation](https://www.twilio.com/docs/sms) (still relevant for SMS)


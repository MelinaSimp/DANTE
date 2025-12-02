# SMS Setup Guide

This guide explains how to set up SMS (text messaging) for your AI agents.

## Overview

When someone sends a text message to your agent's phone number, the AI will:
1. Receive the message via Twilio webhook
2. Process it through the agent's workflow
3. Send a response back via SMS

## Prerequisites

1. **Twilio Account**: You need a Twilio account with SMS capabilities
2. **Phone Number**: A Twilio phone number that supports SMS
3. **Agent Configured**: An agent with a phone number set in Advanced settings
4. **Twilio Credentials**: Your Twilio Account SID and Auth Token saved in settings

## Setup Steps

### 1. Configure Twilio Phone Number

1. Go to [Twilio Console](https://console.twilio.com/)
2. Navigate to **Phone Numbers** > **Manage** > **Active Numbers**
3. Click on your phone number
4. Scroll to **Messaging** section
5. Under **A MESSAGE COMES IN**, set the webhook URL to:
   ```
   https://your-domain.com/api/twilio/sms
   ```
   Replace `your-domain.com` with your actual domain (e.g., `drift-iuyfxp3iy-drift4.vercel.app`)

6. Set **HTTP Method** to `POST`
7. Click **Save**

### 2. Configure Agent Phone Number

1. In your Drift CRM app, go to **GigaAI**
2. Select your agent
3. Go to **Advanced** tab
4. Enter your Twilio phone number in **Phone Number** field
5. Make sure the number matches exactly what's in Twilio (including country code, e.g., `+12163508215`)
6. Save the agent

### 3. Deploy Agent

1. Make sure your agent is **deployed** (status should be "Deployed")
2. If not deployed, click **Deploy agent** button

## How It Works

### Message Flow

```
User sends SMS → Twilio receives → Webhook to /api/twilio/sms
  ↓
Find agent by phone number
  ↓
Create/load conversation
  ↓
Process message through agent executor
  ↓
Generate response
  ↓
Send SMS back via Twilio API
```

### Conversation Management

- Each phone number pair (customer ↔ agent) gets a unique conversation
- Conversations persist across multiple messages
- Full transcript is saved in the database
- Agent workflow steps are executed just like in chat

### Supported Features

✅ **All Agent Steps**:
- Say steps (with configured messages)
- Gather steps (extract information)
- Q/A steps (answer questions from data sources)
- Condition steps (branching logic)
- Schedule steps (book appointments)
- API call steps

✅ **Conversation Context**:
- Remembers previous messages
- Maintains gathered data
- Follows scenario flow

✅ **Error Handling**:
- Graceful fallbacks if agent not found
- Error messages if processing fails
- Silent failures to avoid Twilio retries

## Testing

1. **Send a test message**:
   - Text your agent's phone number from your cell phone
   - You should receive a response within a few seconds

2. **Check logs**:
   - Check Vercel logs for `[Twilio SMS]` entries
   - Verify conversation was created in database

3. **Verify in app**:
   - Go to **Evaluations** > **Guests**
   - You should see the conversation appear
   - Click to view full transcript

## Troubleshooting

### No Response Received

1. **Check Twilio webhook URL**:
   - Make sure it's set correctly in Twilio console
   - URL should be: `https://your-domain.com/api/twilio/sms`

2. **Check agent phone number**:
   - Must match exactly (including `+1` prefix)
   - Check in Advanced settings

3. **Check agent status**:
   - Agent should be deployed
   - Check agent status in GigaAI

4. **Check Twilio credentials**:
   - Verify Account SID and Auth Token are saved
   - Check in Settings > Twilio

5. **Check logs**:
   - Look for `[Twilio SMS]` entries in Vercel logs
   - Check for error messages

### Wrong Agent Responding

- **Phone number mismatch**: Make sure agent phone number matches Twilio number exactly
- **Multiple agents**: Only one agent per phone number is supported

### Messages Not Appearing in Evaluations

- **Check conversation status**: Should be "active"
- **Check transcript**: Messages should be in transcript array
- **Refresh page**: Try refreshing the Evaluations page

## Production URL

Your SMS webhook URL should be:
```
https://your-production-domain.com/api/twilio/sms
```

For Vercel deployments, use your Vercel URL:
```
https://your-app.vercel.app/api/twilio/sms
```

## Security

- All webhooks require valid Twilio signatures (handled by Twilio)
- Conversations are isolated by workspace (RLS policies)
- Phone numbers are normalized and validated
- Error messages don't expose sensitive information

## Limitations

- **One agent per phone number**: Each phone number can only be assigned to one agent
- **SMS only**: Voice calls use a different endpoint (`/api/twilio/incoming`)
- **Twilio costs**: SMS messages incur Twilio charges (check your plan)
- **Rate limits**: Twilio has rate limits on SMS (check your account limits)

## Next Steps

1. Set up webhook in Twilio
2. Configure agent phone number
3. Deploy agent
4. Test with a text message
5. Monitor conversations in Evaluations page

For issues, check Vercel logs and Twilio console for error messages.



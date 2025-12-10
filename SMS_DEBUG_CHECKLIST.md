# SMS Debug Checklist

## Step 1: Check Agent Configuration
1. Is your agent **deployed**? (Status should be "Deployed", not "Draft")
2. Is the **phone number** set in Advanced settings?
3. Does the phone number match your Twilio number **exactly**? (including +1 prefix)

## Step 2: Check Twilio Webhook
1. Go to Twilio Console → Phone Numbers → Manage → Active Numbers
2. Click your phone number
3. Scroll to **Messaging** section
4. Check **"A MESSAGE COMES IN"** webhook URL:
   - Should be: `https://drift-6ngv7lmw8-drift4.vercel.app/api/twilio/sms`
   - HTTP Method should be: **POST**
5. Click **Save**

## Step 3: Check Vercel Logs
1. Go to Vercel Dashboard
2. Select your project
3. Go to **Deployments** tab
4. Click latest deployment
5. Click **Functions** tab
6. Look for `/api/twilio/sms` function
7. Check for errors with `[Twilio SMS]` prefix

## Step 4: Test Webhook
Send a test message and check logs for:
- `[Twilio SMS] Incoming message:` - Webhook received
- `[Twilio SMS] Found agent:` - Agent found
- `[Twilio SMS] Response sent successfully` - SMS sent

## Common Issues:
- ❌ Agent not deployed
- ❌ Phone number mismatch
- ❌ Webhook URL not configured
- ❌ Twilio credentials missing
- ❌ Agent has no scenarios/steps configured


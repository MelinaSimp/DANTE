# SMS Troubleshooting Guide

## Issue: No Response Received

If you sent a text message but didn't receive a reply, check these in order:

### 1. Check Twilio Webhook Configuration

**In Twilio Console:**
1. Go to **Phone Numbers** > **Manage** > **Active Numbers**
2. Click your phone number
3. Scroll to **Messaging** section
4. Verify **A MESSAGE COMES IN** webhook URL is set to:
   ```
   https://your-domain.com/api/twilio/sms
   ```
5. Make sure HTTP Method is set to **POST**
6. Click **Save**

**Common Issues:**
- ❌ Webhook URL not set
- ❌ Wrong URL (missing `/api/twilio/sms`)
- ❌ HTTP Method set to GET instead of POST
- ❌ Using old/staging URL instead of production

### 2. Check Vercel Logs

**View logs:**
1. Go to [Vercel Dashboard](https://vercel.com)
2. Select your project
3. Go to **Deployments** tab
4. Click on latest deployment
5. Click **Functions** tab
6. Look for `/api/twilio/sms` function
7. Check for `[Twilio SMS]` log entries

**What to look for:**
- ✅ `[Twilio SMS] Incoming message:` - Webhook received
- ✅ `[Twilio SMS] Found agent:` - Agent found
- ❌ `[Twilio SMS] Agent not found` - Agent not configured
- ❌ `[Twilio SMS] Twilio credentials not found` - Credentials missing
- ❌ `[Twilio SMS] Failed to send SMS` - Sending failed

### 3. Check Agent Configuration

**Verify agent phone number:**
1. Go to **GigaAI** in your app
2. Select your agent
3. Go to **Advanced** tab
4. Check **Phone Number** field
5. Must match Twilio number **exactly** (including `+1` prefix)

**Common Issues:**
- ❌ Phone number not set
- ❌ Phone number format mismatch (e.g., `2163508215` vs `+12163508215`)
- ❌ Agent not deployed
- ❌ Agent belongs to different workspace

**Phone Number Formats:**
- ✅ `+12163508215` (E.164 format - recommended)
- ✅ `2163508215` (without country code - will be normalized)
- ❌ `(216) 350-8215` (with formatting - may not match)

### 4. Check Twilio Credentials

**Verify credentials are saved:**
1. Go to **Settings** in your app
2. Check if Twilio credentials are configured
3. Verify **Account SID** and **Auth Token** are correct

**Or check environment variables:**
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`

**Common Issues:**
- ❌ Credentials not saved in database
- ❌ Wrong workspace credentials
- ❌ Credentials expired/invalid

### 5. Check Twilio Console Logs

**In Twilio Console:**
1. Go to **Monitor** > **Logs** > **Messaging**
2. Find your message
3. Check **Status** column
4. Click on message to see details
5. Check **Webhook** section for errors

**Common Status Values:**
- ✅ **Received** - Message received by Twilio
- ✅ **Delivered** - Response sent successfully
- ❌ **Failed** - Webhook or sending failed
- ❌ **Undelivered** - Couldn't deliver response

### 6. Test Webhook Manually

**Using curl:**
```bash
curl -X POST https://your-domain.com/api/twilio/sms \
  -d "MessageSid=SM123" \
  -d "From=%2B12165099657" \
  -d "To=%2B12163508215" \
  -d "Body=Hello"
```

**Check response:**
- Should return empty response (status 200)
- Check Vercel logs for processing

### 7. Common Error Messages

**"Agent not found for phone number"**
- Solution: Set phone number in agent Advanced settings
- Make sure format matches Twilio number exactly

**"Twilio credentials not found"**
- Solution: Save Twilio credentials in Settings
- Or set `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` env vars

**"Failed to send SMS"**
- Check Twilio account balance
- Verify phone number has SMS capability
- Check Twilio error code in logs

**"Missing required fields"**
- Webhook not receiving proper form data
- Check Twilio webhook configuration

## Debugging Steps

1. **Check if webhook is being called:**
   - Look for `[Twilio SMS] Incoming message` in Vercel logs
   - If not present, webhook URL is wrong or not configured

2. **Check if agent is found:**
   - Look for `[Twilio SMS] Found agent:` in logs
   - If not, check agent phone number configuration

3. **Check if response is generated:**
   - Look for `[Twilio SMS] Response sent successfully` in logs
   - If not, check executor errors

4. **Check Twilio message status:**
   - Go to Twilio Console > Monitor > Logs > Messaging
   - Check if response message was created
   - Check delivery status

## Quick Checklist

- [ ] Webhook URL configured in Twilio
- [ ] Agent phone number matches Twilio number
- [ ] Agent is deployed
- [ ] Twilio credentials are saved
- [ ] Phone number has SMS capability
- [ ] Twilio account has balance
- [ ] Check Vercel logs for errors
- [ ] Check Twilio logs for webhook errors

## Still Not Working?

1. **Check Vercel logs** for detailed error messages
2. **Check Twilio logs** for webhook delivery status
3. **Verify phone number** matches exactly in both places
4. **Test webhook** manually with curl
5. **Check agent workflow** - make sure it has steps configured

For more help, share:
- Vercel log entries with `[Twilio SMS]`
- Twilio message log details
- Agent phone number configuration
- Twilio webhook URL configuration



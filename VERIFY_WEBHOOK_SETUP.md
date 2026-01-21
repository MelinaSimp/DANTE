# Verify Twilio Webhook Configuration

## 🔍 Problem
Fresh call was made but logs aren't updating. This suggests the call might not be reaching the webhook.

## ✅ Step-by-Step Verification

### 1. Check Twilio Phone Number Webhook Configuration

**In Twilio Console:**
1. Go to: **Phone Numbers** → **Manage** → **Active Numbers**
2. Click on your phone number (the one you're calling)
3. Scroll to **"Voice & Fax"** section
4. Check **"A CALL COMES IN"**:
   - **Webhook URL should be**: `https://driftai.studio/api/twilio/incoming`
   - **HTTP Method should be**: `POST`
5. **If it's different, update it and click "Save"**

### 2. Verify Webhook is Being Called

**Check Vercel Logs:**
1. Go to: https://vercel.com/drift4/drift-crm/logs
2. Filter by: **Request Path** = `/api/twilio/incoming`
3. Make a fresh call
4. **Do you see any POST requests to `/api/twilio/incoming`?**

**If NO logs appear:**
- Twilio isn't calling the webhook
- Check phone number webhook URL is correct
- Check Twilio account status (not suspended/restricted)

**If logs appear:**
- Check for errors in the log entries
- Look for `[Media Stream]` or `[Twilio]` log messages

### 3. Check Alternative Webhook Path

The webhook might be configured to use `/api/twilio/media-stream` directly instead of `/api/twilio/incoming`.

**In Twilio Console:**
- Check if webhook points to: `https://driftai.studio/api/twilio/media-stream`
- If so, that's also correct (we have both routes)

### 4. Test Webhook Manually

**Try calling the webhook directly:**
```bash
curl -X POST https://driftai.studio/api/twilio/incoming \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=test123&From=%2B1234567890&To=%2B12166770276"
```

**Expected:** Should return TwiML XML response

### 5. Check Twilio Account Status

**In Twilio Console:**
1. Go to: **Account** → **Usage & Billing**
2. Check account status
3. Check if there are any restrictions or suspensions

## 🚨 Common Issues

### Issue 1: Webhook URL is Wrong
- **Symptom**: No logs in Vercel when calling
- **Fix**: Update webhook URL in Twilio Console

### Issue 2: Webhook Points to Old URL
- **Symptom**: Logs show 404 errors
- **Fix**: Update to `https://driftai.studio/api/twilio/incoming`

### Issue 3: HTTP Method Wrong
- **Symptom**: Webhook returns method not allowed
- **Fix**: Ensure method is `POST`, not `GET`

### Issue 4: Account Restrictions
- **Symptom**: Calls fail before reaching webhook
- **Fix**: Check Twilio account status and billing

## 📋 Next Steps

1. **Verify webhook URL** in Twilio Console
2. **Make a fresh call**
3. **Check Vercel logs immediately** (within 10 seconds)
4. **Share what you see:**
   - Are there POST requests to `/api/twilio/incoming`?
   - Are there any error messages?
   - What's the timestamp of the logs?

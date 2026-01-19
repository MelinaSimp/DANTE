# Voice Call Not Working - Debug Steps

## 🔍 Step 1: Check Vercel Logs

**The most important step** - Check if the webhook is being called:

1. **Go to Vercel Dashboard**: https://vercel.com/driftai-studio
2. **Click on your project** → **"Logs"** tab
3. **Make a test call** to your Twilio number
4. **Check Vercel logs** for one of these:

### ✅ If you see logs like:
- `[Media Stream] WebSocket connection request: { callSid: '...', from: '...', to: '...' }`
- `[Twilio] Incoming call: { callSid: '...', from: '...', to: '...' }`

**→ Webhook IS being called!** The issue is in the webhook logic, not Twilio restrictions.

### ❌ If you see NO logs:
**→ Webhook is NOT being called!** This means:
- Twilio is blocking the call before reaching your webhook
- This is the "calling restrictions" issue we discussed earlier
- Check Twilio account/number restrictions

## 🔍 Step 2: Check Twilio Call Logs

1. **Go to Twilio Console** → **Monitor** → **Logs** → **Calls**
2. **Find your recent call attempt**
3. **Check the "Status"** and **"Error Code"**

### Common Error Codes:
- **13224**: Geographic restriction
- **13225**: Regulatory restriction  
- **13226**: Number not allowed to receive calls
- **13227**: Caller ID restriction
- **11200**: HTTP retrieval failure (webhook issue)
- **15003**: Call progress warning (TwiML issue)

## 🔍 Step 3: What Error Are You Hearing?

**When you call, what do you hear?**
- "The number you have dialed has calling restrictions" → Twilio restriction (before webhook)
- "This line is not configured" → Webhook called but agent not found
- "Invalid phone number format" → Webhook called but phone format issue
- Ringing then hangup → Webhook might not be returning valid TwiML
- Nothing / Dead air → Webhook not responding

## 🔍 Step 4: Verify Twilio Configuration

**Double-check your webhook URL:**

1. **Twilio Console** → **Phone Numbers** → **Manage** → **Active Numbers**
2. **Click on your number** (216) 677-0276
3. **Go to "Configure" tab**
4. **Check "A call comes in":**
   - Should be: `https://driftai.studio/api/twilio/media-stream`
   - Method: **HTTP POST**
5. **Check "Primary handler fails":**
   - Should be: `https://driftai.studio/api/twilio/incoming`
   - Method: **HTTP POST**

## 🔍 Step 5: Check Railway Server

**Even though Railway is running, verify it's reachable:**

1. **Go to**: https://driftai.studio/api/debug/check-railway
2. **Should see**: `✅ Railway server is reachable and healthy`
3. **If not**: Railway server might still have issues

## 🚨 Quick Checklist

- [ ] Check Vercel logs when calling (most important!)
- [ ] Check Twilio call logs for error code
- [ ] Note the exact error message you hear
- [ ] Verify webhook URL in Twilio Console
- [ ] Check Railway health endpoint

## 📋 What to Report Back

Please tell me:
1. **Do you see any logs in Vercel** when you call? (Yes/No)
2. **What error code** in Twilio call logs? (If any)
3. **What do you hear** when you call? (Exact message)
4. **Is Railway health check working?** (Check the diagnostic endpoint)

This will help me identify the exact issue!

# Twilio Not Connecting to Railway WebSocket

## 🚨 Problem

- ✅ Railway server is running and healthy
- ✅ Webhook is being called (Vercel logs show TwiML being returned)
- ✅ TwiML contains Media Stream URL
- ❌ **Twilio is NOT connecting to Railway WebSocket** (no logs in Railway)
- ❌ **Still getting "calling restrictions" error**

## 🔍 Why This Happens

When Twilio receives TwiML with a `<Stream>` tag, it tries to connect to the WebSocket URL. If it can't connect, Twilio may:
1. Reject the call entirely
2. Show a generic error (like "calling restrictions")
3. Fall back to regular Twilio flow (if configured)

## ✅ Solutions

### Solution 1: Force Fallback to Regular Twilio Flow

Since Media Streams isn't working, let's force the fallback to regular Twilio flow:

**In `app/api/twilio/media-stream/route.ts`, temporarily disable Media Streams:**

```typescript
// Force fallback - disable Media Streams temporarily
let useMediaStreams = false;
```

This will use regular Twilio `<Say>` and `<Gather>` instead of Media Streams.

### Solution 2: Check Twilio Call Logs

1. **Go to Twilio Console** → **Monitor** → **Logs** → **Calls**
2. **Find your recent call attempt**
3. **Check the error code** - this will tell us why Twilio can't connect

Common error codes:
- **11200**: HTTP retrieval failure (webhook issue)
- **15003**: Call progress warning (TwiML issue)
- **13200**: Invalid TwiML format
- **13210**: Invalid URL in TwiML
- **13216**: Media Stream connection failed

### Solution 3: Test Railway WebSocket URL

**Check if Twilio can reach Railway:**

1. Try accessing Railway from different locations
2. Check Railway SSL certificate validity
3. Verify Railway allows WebSocket connections

**Test Railway WebSocket directly:**
```bash
wscat -c wss://motivated-perfection-production.up.railway.app/media-stream
```

If this fails, Railway might not be accepting WebSocket connections properly.

### Solution 4: Check Media Stream URL Format

The URL in TwiML must:
- Start with `wss://` (secure WebSocket)
- Be accessible from Twilio's servers
- Have valid SSL certificate
- Accept WebSocket connections on port 443

**Current URL format:**
```
wss://motivated-perfection-production.up.railway.app/media-stream?CallSid=...&From=...&To=...&conversationId=...
```

This looks correct, but Twilio might have issues connecting.

### Solution 5: Use Railway Public Domain

Sometimes Railway's auto-generated domains have issues. Try:
1. **Railway Dashboard** → Your Service → **Settings** → **Networking**
2. **Add a custom domain** (if available)
3. **Use the custom domain** in Media Stream URL

## 🚀 Quick Fix (Recommended)

**Temporarily disable Media Streams to test if regular Twilio flow works:**

1. Edit `app/api/twilio/media-stream/route.ts`
2. Change line 224 to: `let useMediaStreams = false;`
3. Deploy to Vercel
4. Test a call

**If regular Twilio flow works:**
- The issue is specifically with Media Streams WebSocket connection
- We need to fix Railway WebSocket configuration

**If regular Twilio flow still doesn't work:**
- The issue is deeper (Twilio account/number restrictions)
- We need to check Twilio call logs for specific error codes

## 📋 Next Steps

1. **Check Twilio call logs** for error code (most important!)
2. **Try fallback Twilio flow** (disable Media Streams temporarily)
3. **Check Railway WebSocket** is accepting connections
4. **Test Railway URL** accessibility from Twilio's servers

The Twilio call logs will tell us the exact error code and why it's failing.

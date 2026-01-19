# Railway Media Stream Server Diagnostic

## 🔍 Check Railway Server Status

### Option 1: Use the Diagnostic Endpoint

After deploying, visit:
```
https://driftai.studio/api/debug/check-railway
```

This will tell you:
- ✅ If Railway server is reachable
- ✅ Health check status
- ✅ Response time
- ✅ Any errors

### Option 2: Check Railway Dashboard

1. Go to **Railway Dashboard** → **motivated-perfection** service
2. Check:
   - [ ] Service status is **"Active"** or **"Online"**
   - [ ] Recent logs show: `[Media Stream] WebSocket server listening on port 8080`
   - [ ] No error messages in logs
   - [ ] Service has been deployed recently

### Option 3: Manual Health Check

Try accessing:
```
https://motivated-perfection-production.up.railway.app/health
```

You should see:
```json
{
  "status": "ok",
  "connections": 0,
  "timestamp": "..."
}
```

## 🚨 If Railway Server is Down

If the Railway server is not reachable:

1. **Check Railway Deployment:**
   - Go to Railway dashboard
   - Check if service is running
   - Check deployment logs for errors

2. **Check Environment Variables:**
   - `NEXTJS_API_URL` should be `https://driftai.studio`
   - `ELEVENLABS_API_KEY` should be set
   - `PORT` should be set (defaults to 3001, but Railway might use 8080)

3. **Redeploy Railway Service:**
   - If needed, trigger a redeploy in Railway
   - Check that the service starts successfully

## 🔍 How This Affects Calls

**Important:** The webhook (`/api/twilio/media-stream`) has a **fallback mechanism**:

1. **If Railway health check passes:**
   - Uses Media Streams (WebSocket)
   - Returns TwiML with `<Stream>` tag

2. **If Railway health check fails:**
   - Falls back to regular Twilio flow
   - Returns TwiML with `<Say>` and `<Gather>`
   - **Calls should still work**, just without Media Streams

## ⚠️ Important Note

**"Calling restrictions" error typically happens BEFORE the webhook is called.**

However, if the webhook IS being called but:
- Returns invalid TwiML
- Times out
- Returns an error

Twilio might show a different error (like "11200 - HTTP retrieval failure"), not "calling restrictions".

## 📋 Next Steps

1. **Check Railway server status** using the diagnostic endpoint
2. **Check Vercel logs** to see if webhook is being called
3. **Check Twilio call logs** to see the exact error code
4. **Verify Railway deployment** is active and healthy

# Twilio Error 11200 - HTTP Retrieval Failure

## 🔍 What This Error Means

**Error 11200** means Twilio tried to call your webhook but couldn't reach it. This could be:
- Endpoint doesn't exist (404)
- Endpoint returns an error (500)
- Network/SSL issues
- Vercel deployment not complete
- Endpoint timeout

---

## ✅ Quick Checks

### 1. **Verify Endpoint Exists**
The endpoint should be at: `https://driftai.studio/api/twilio/media-stream`

**Check in Vercel:**
1. Go to Vercel Dashboard → Your Project → Deployments
2. Check the latest deployment status
3. Look for build errors
4. If build failed, check the build logs

### 2. **Test the Endpoint Manually**

Try accessing the endpoint directly:
```bash
curl -X POST https://driftai.studio/api/twilio/media-stream \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=test123&From=%2B1234567890&To=%2B1987654321"
```

**Expected response:** Valid TwiML XML (even if it's an error message)

**If you get 404:**
- Route not deployed yet
- Wait for Vercel deployment to complete
- Or redeploy manually

**If you get 500:**
- Check Vercel function logs
- Look for error messages
- Fix the code issue

### 3. **Check Vercel Deployment Status**

1. Go to: https://vercel.com/dashboard
2. Click on your project
3. Check "Deployments" tab
4. Look for the latest deployment:
   - ✅ **Ready** = Deployment complete
   - ⏳ **Building** = Still deploying
   - ❌ **Error** = Build failed

### 4. **Check Vercel Function Logs**

1. Go to Vercel Dashboard → Your Project → Functions
2. Click on `/api/twilio/media-stream`
3. Check "Logs" tab
4. Look for:
   - `[Media Stream]` log entries
   - Error messages
   - Stack traces

### 5. **Verify Twilio Webhook Configuration**

In Twilio Console:
1. Go to: Phone Numbers → Manage → Active Numbers
2. Click your phone number
3. Check "A call comes in" webhook:
   - URL: `https://driftai.studio/api/twilio/media-stream`
   - Method: **HTTP POST**
4. Click "Save"

---

## 🔧 Common Fixes

### Fix 1: Wait for Deployment
**If deployment is still building:**
- Wait 1-2 minutes
- Check deployment status
- Try calling again after deployment completes

### Fix 2: Force Redeploy
**If endpoint should be deployed but isn't working:**
1. Go to Vercel Dashboard
2. Click "Deployments" tab
3. Click "⋯" on latest deployment
4. Click "Redeploy"
5. Wait for completion

### Fix 3: Check Build Errors
**If build failed:**
1. Check Vercel build logs
2. Look for TypeScript/import errors
3. Fix the errors
4. Push to GitHub (auto-deploys)

### Fix 4: Verify Route File Exists
**Make sure the file exists:**
- Path: `app/api/twilio/media-stream/route.ts`
- Should export both `GET` and `POST` functions
- Should have `export const dynamic = "force-dynamic"`

### Fix 5: Check SSL Certificate
**If SSL issues:**
- Vercel handles SSL automatically
- Check if domain is properly configured
- Wait for SSL certificate to provision (can take a few minutes)

---

## 🧪 Testing Steps

### Step 1: Test Endpoint Directly
```bash
# Test with POST (Twilio's method)
curl -X POST https://driftai.studio/api/twilio/media-stream \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=test123&From=%2B1234567890&To=%2B1987654321"
```

**Expected:** TwiML XML response

### Step 2: Check Vercel Logs
1. Make a test call to your Twilio number
2. Immediately check Vercel logs
3. Look for `[Media Stream]` entries
4. Check for error messages

### Step 3: Check Twilio Logs
1. Go to Twilio Console → Monitor → Logs → Calls
2. Find your test call
3. Check "Errors" tab
4. Look for 11200 error details

---

## 📋 Checklist

- [ ] Vercel deployment is complete (status: Ready)
- [ ] Endpoint file exists: `app/api/twilio/media-stream/route.ts`
- [ ] Route exports both GET and POST
- [ ] Twilio webhook URL is correct: `https://driftai.studio/api/twilio/media-stream`
- [ ] Twilio webhook method is POST
- [ ] Test endpoint manually returns TwiML
- [ ] No build errors in Vercel
- [ ] SSL certificate is valid (check browser)

---

## 🚨 If Still Not Working

1. **Check Vercel Function Logs:**
   - Look for specific error messages
   - Check stack traces
   - Look for database connection errors

2. **Check Environment Variables:**
   - `RAILWAY_WEBSOCKET_URL` (optional, has fallback)
   - `PUBLIC_BASE_URL` or `APP_BASE_URL` (optional, has fallback)
   - Supabase credentials (required)

3. **Try Fallback Endpoint:**
   - Temporarily use `/api/twilio/incoming` instead
   - This uses regular Twilio flow (not Media Streams)
   - If this works, the issue is with Media Streams endpoint

4. **Check Network:**
   - Try from different network
   - Check if Vercel is having issues
   - Check Twilio status page

---

## 📞 Next Steps

1. **Check Vercel deployment status** (most likely issue)
2. **Test endpoint manually** with curl
3. **Check Vercel function logs** for errors
4. **Verify Twilio webhook configuration** is correct
5. **Wait 2-3 minutes** after deployment before testing

The endpoint should work once Vercel finishes deploying the latest changes!

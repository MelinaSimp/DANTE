# Railway Server Stopped - How to Restart

## 🚨 Problem

Your Railway Media Stream server stopped running. The logs show:
- ✅ Started at `14:37:10`
- ❌ Stopped at `15:14:19` (about 37 minutes later)
- Status: "Removed"

## ✅ Solution: Restart Railway Service

### Option 1: Redeploy in Railway Dashboard

1. **Go to Railway Dashboard**: https://railway.com
2. **Click on your project**: `creative-gentleness`
3. **Click on the service**: `motivated-perfection`
4. **Go to "Deployments" tab** (or "Settings" tab)
5. **Click "Redeploy"** or **"Deploy"** button
6. **Wait for deployment to complete**
7. **Check logs** to confirm server starts:
   - Should see: `[Media Stream] WebSocket server listening on port 8080`

### Option 2: Trigger via Git Push

If Railway is connected to your GitHub repo:

1. Make a small change to `media-streams-server/index.js` (add a comment)
2. Commit and push:
   ```bash
   git add media-streams-server/index.js
   git commit -m "chore: Trigger Railway redeploy"
   git push
   ```
3. Railway should auto-deploy

### Option 3: Check Service Settings

If the service keeps stopping, check:

1. **Railway Dashboard** → `motivated-perfection` → **Settings**
2. **Check "Auto-Deploy"** is enabled
3. **Check "Root Directory"** is set to: `media-streams-server`
4. **Check "Start Command"** is set to: `npm start`
5. **Check "Build Command"** is set to: `npm install`

## 🔍 Why Did It Stop?

Possible reasons:
1. **Railway free tier limits** - Service might auto-stop after inactivity
2. **Service crashed** - Check logs for errors before `Stopping Container`
3. **Manual stop** - Someone stopped it in Railway dashboard
4. **Deployment issue** - Service was redeployed and stopped

## ⚠️ Important Note

**Even if Railway is down, calls should still work!**

The webhook (`/api/twilio/media-stream`) has a **fallback mechanism**:
- If Railway health check fails → Falls back to regular Twilio flow
- Calls should still connect (just without Media Streams)

**However**, if you're getting "calling restrictions" error, that happens **BEFORE** the webhook is called, so it's likely a separate Twilio account/number restriction issue.

## 📋 After Restarting

1. **Check Railway logs** - Should see server starting
2. **Test health endpoint**: `https://motivated-perfection-production.up.railway.app/health`
3. **Use diagnostic endpoint**: `https://driftai.studio/api/debug/check-railway`
4. **Test a call** - Should work with Media Streams if Railway is up

## 🚀 Quick Fix

**Fastest way to restart:**
1. Go to Railway Dashboard
2. Click on `motivated-perfection` service
3. Click "Redeploy" or "Deploy" button
4. Wait ~30 seconds
5. Check logs to confirm it's running

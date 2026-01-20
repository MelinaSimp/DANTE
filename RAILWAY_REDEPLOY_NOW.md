# Railway Not Deployed - Manual Redeploy Needed

## 🚨 Problem

Railway logs show last deployment was **Jan 19, 2026 at 8:08 PM**, but we just pushed the WebSocket fix today (Jan 20). Railway hasn't auto-deployed the latest code.

## ✅ Solution: Manually Trigger Railway Redeploy

### Option 1: Redeploy via Railway Dashboard (Recommended)

1. **Go to Railway Dashboard**: https://railway.com
2. **Navigate to your service**:
   - Click on project: `creative-gentleness`
   - Click on service: `motivated-perfection`
3. **Go to "Deployments" tab**
4. **Click "Redeploy"** button (or "Deploy Latest")
5. **Wait for deployment to complete** (2-3 minutes)
6. **Check logs** - you should see:
   - `[Media Stream] WebSocket server listening on port 8080`
   - `[Media Stream] Server bound to 0.0.0.0 (accepting external connections)`

### Option 2: Verify Auto-Deploy Settings

If auto-deploy isn't working:

1. **Railway Dashboard** → `motivated-perfection` → **Settings**
2. **Check these settings**:
   - ✅ **"Auto-Deploy"** is **enabled**
   - ✅ **"Root Directory"** is set to: `media-streams-server`
   - ✅ **"Start Command"** is set to: `npm start`
   - ✅ **"Build Command"** is set to: `npm install`
   - ✅ **"Branch"** is set to: `main`
3. **If any are wrong, fix them and click "Save"**

### Option 3: Trigger via Empty Commit

If Railway is connected to GitHub but not auto-deploying:

```bash
git commit --allow-empty -m "chore: Trigger Railway redeploy"
git push
```

## 🔍 Verify Deployment

After redeploying, check:

1. **Railway Logs**:
   - Should show: `[Media Stream] Server bound to 0.0.0.0`
   - Should show: `[Media Stream] WebSocket server listening on port 8080`
   - Should show current timestamp (not Jan 19)

2. **Health Check**:
   ```
   https://motivated-perfection-production.up.railway.app/health
   ```
   Should return: `{"status":"ok","connections":0,"timestamp":"..."}`

3. **Make a test call**:
   - Check Railway logs for: `[Media Stream] Upgrade request received`
   - Check Railway logs for: `[Media Stream] ✅ New connection`

## 🚨 If Redeploy Still Doesn't Work

Check Railway service status:
1. Is the service **"Online"** or **"Active"**?
2. Are there any **errors** in the deployment logs?
3. Are **environment variables** set correctly?
   - `NEXTJS_API_URL=https://driftai.studio`
   - `ELEVENLABS_API_KEY=sk_f25abdc5c269abea44ea361c701d3eef62a15d02d9b32d73`

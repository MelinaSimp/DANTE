# Railway Build Failed - How to Fix

## Problem

Railway build failed - likely because Railway needs explicit build/start commands configured.

## Solution

### In Railway Dashboard:

1. **Go to your service**: Click on "motivated-perfection" service
2. **Go to "Settings" tab**
3. **Scroll to "Build" section** (click "Build" in the right sidebar)
4. **Set Build Command**:
   ```
   npm install
   ```
5. **Set Start Command** (if not already set):
   ```
   npm start
   ```
6. **Make sure Root Directory is set to**: `media-streams-server`
7. **Save changes**
8. **Click "Redeploy"** or wait for auto-deploy

## Alternative: Check Build Logs

1. **Go to "Deployments" tab** in Railway
2. **Click on the failed deployment**
3. **Check the build logs** to see the exact error

Common errors:
- Missing `npm install` (need to set Build Command)
- Wrong Node.js version (need to set Node version)
- Missing dependencies (check package.json)

## Quick Check

The code looks fine - the issue is likely Railway configuration. Make sure:
- ✅ Build Command: `npm install`
- ✅ Start Command: `npm start`
- ✅ Root Directory: `media-streams-server`

Then redeploy!

# Electron Redirect Loop Fix

## ❌ Problem: ERR_TOO_MANY_REDIRECTS

The custom domain `driftai.studio` is causing a redirect loop. This is likely because:
1. The domain has redirect rules configured
2. Vercel is redirecting HTTP to HTTPS in a loop
3. The app's auth redirects are conflicting

## ✅ Solution: Use Vercel URL Directly

### Option 1: Find Your Vercel URL

1. Go to **Vercel Dashboard** → Your Project
2. Look at the **latest deployment**
3. Copy the URL (looks like `https://drift-xxxxx.vercel.app`)

### Option 2: Run Electron with Vercel URL

```bash
ELECTRON_APP_URL=https://your-vercel-url.vercel.app npm run electron
```

Replace `your-vercel-url.vercel.app` with your actual Vercel deployment URL.

### Option 3: Update electron/main.js

Edit `electron/main.js` and replace the `vercelUrl` line with your actual Vercel URL:

```javascript
const vercelUrl = 'https://drift-xxxxx.vercel.app'; // Your actual Vercel URL
```

Then run:
```bash
npm run electron
```

## 🔍 Find Your Vercel URL

1. Go to: https://vercel.com/dashboard
2. Click on your project
3. Look at the **"Deployments"** tab
4. Click on the latest deployment
5. Copy the URL (it's shown at the top)

## 💡 Why This Happens

The custom domain might have:
- Redirect rules in Vercel
- DNS redirects
- SSL certificate redirects

Using the Vercel URL directly bypasses these issues.

---

**Quick Fix:** Just use your Vercel URL instead of the custom domain for Electron!


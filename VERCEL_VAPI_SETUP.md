# Add VAPI_API_KEY to Vercel

## Quick Steps

1. **Go to Vercel Dashboard**
   - https://vercel.com/dashboard
   - Select your project: `drift-crm`

2. **Navigate to Settings**
   - Click on your project
   - Go to **Settings** tab
   - Click **Environment Variables** in the left sidebar

3. **Add the Variable**
   - Click **Add New**
   - **Key**: `VAPI_API_KEY`
   - **Value**: `2bf8f671-ccbb-440b-bf7e-9d5985ad3152`
   - **Environments**: Check all three:
     - ☑ Production
     - ☑ Preview
     - ☑ Development
   - Click **Save**

4. **Redeploy**
   - Go to **Deployments** tab
   - Find the latest deployment
   - Click the **⋯** (three dots) menu
   - Click **Redeploy**
   - Or push a new commit to trigger a redeploy

## Why This Matters

The `VAPI_API_KEY` is used by:
- `/api/vapi/configure-assistant` - API route to configure Vapi assistant
- Any scripts that call Vapi's API from your server

**However**, your webhook (`/api/vapi/webhook`) doesn't actually need this key - it just receives webhooks FROM Vapi.

But it's good to have it set in case you need to make API calls to Vapi from your server.

## Verify It's Set

After redeploying, you can test:
```bash
curl https://drift-1et9oivry-drift4.vercel.app/api/vapi/configure-assistant
```

Or check Vercel logs after the redeploy to see if the variable is accessible.

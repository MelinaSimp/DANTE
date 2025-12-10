# Use Your Custom Domain Everywhere - One-Time Setup

## The Problem
Every time Vercel deploys, you get a new URL like `drift-xxxxx-vercel.app`, and you have to update:
- Twilio webhook URL
- Google Cloud Console redirect URI
- Any other services

## The Solution
Use your custom domain `driftai.studio` everywhere. Once configured, it automatically points to your latest deployment.

## Step 1: Configure Domain in Vercel (One-Time)

1. Go to **Vercel Dashboard** → Your Project → **Settings** → **Domains**
2. Click **"Add Domain"**
3. Enter: `driftai.studio`
4. Vercel will show DNS records - add them to your domain registrar
5. Wait for DNS to propagate (5-30 minutes)
6. Vercel automatically assigns the domain to your latest deployment

**Result**: `https://driftai.studio` always points to your latest deployment ✅

## Step 2: Update Twilio (One-Time)

1. Go to **Twilio Console** → **Phone Numbers** → Your Number
2. Under **Messaging** → **"A MESSAGE COMES IN"**
3. Set webhook URL to:
   ```
   https://driftai.studio/api/twilio/sms
   ```
4. Click **Save**

**Result**: Twilio always uses your custom domain ✅

## Step 3: Update Google Cloud Console (One-Time)

### Branding Page:
1. **Application home page**: `https://driftai.studio`
2. **Authorized domains**: Add `driftai.studio`

### Clients Page:
1. Go to **Clients** → Click **"Drift OAuth"**
2. Under **"Authorized redirect URIs"**, add:
   ```
   https://driftai.studio/api/integrations/google/oauth
   ```
3. Click **Save**

**Result**: Google OAuth always uses your custom domain ✅

## Step 4: Set Environment Variable (Optional but Recommended)

In Vercel → Settings → Environment Variables:
- Name: `PUBLIC_BASE_URL`
- Value: `https://driftai.studio`
- Environments: Production, Preview, Development

## Benefits

✅ **One-time setup** - Configure once, works forever
✅ **No more updates** - New deployments automatically use your domain
✅ **Professional** - Use your own domain instead of Vercel URLs
✅ **Consistent** - Same URL everywhere, no confusion

## After Setup

- Your app: `https://driftai.studio`
- Twilio webhook: `https://driftai.studio/api/twilio/sms`
- Google OAuth: `https://driftai.studio/api/integrations/google/oauth`
- Google Calendar webhook: `https://driftai.studio/api/integrations/google-calendar/webhook`

All of these will automatically work with every new deployment! 🎉


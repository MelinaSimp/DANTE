# Update All Services to Use driftai.studio

Your domain `driftai.studio` is already configured in Vercel! Now let's update all services to use it.

## ✅ Step 1: Verify Domain Assignment in Vercel

1. In Vercel Dashboard → Your Project (`drift-crm`)
2. Go to **Settings** → **Domains**
3. Make sure `driftai.studio` is assigned to your project
4. If not, click on the domain and assign it to `drift-crm`

## ✅ Step 2: Update Twilio Webhook

1. Go to **Twilio Console** → **Phone Numbers** → Your Number
2. Under **Messaging** → **"A MESSAGE COMES IN"**
3. Change webhook URL to:
   ```
   https://driftai.studio/api/twilio/sms
   ```
4. Click **Save**

## ✅ Step 3: Update Google Cloud Console

### Branding Page:
1. **Application home page**: `https://driftai.studio`
2. **Authorized domains**: Make sure `driftai.studio` is listed (without https://)
3. Click **Save**

### Clients Page:
1. Go to **Clients** → Click **"Drift OAuth"**
2. Under **"Authorized redirect URIs"**:
   - Remove any old Vercel URLs (like `drift-xxxxx-vercel.app`)
   - Add: `https://driftai.studio/api/integrations/google/oauth`
3. Click **Save**

## ✅ Step 4: Set Environment Variable (Optional)

In Vercel → Settings → Environment Variables:
- Name: `PUBLIC_BASE_URL`
- Value: `https://driftai.studio`
- Environments: Production, Preview, Development

## ✅ Step 5: Test

1. Visit: `https://driftai.studio`
2. Try connecting Google Calendar
3. Send a test SMS to your Twilio number

## Benefits

✅ **No more URL updates** - Use `driftai.studio` forever
✅ **Professional** - Your own domain instead of Vercel URLs
✅ **Consistent** - Same URL everywhere
✅ **Automatic** - New deployments automatically use your domain


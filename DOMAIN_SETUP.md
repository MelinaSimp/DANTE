# Domain Setup - driftai.studio

## ✅ Your Production Domain

**`https://driftai.studio`**

This is your custom domain for the Drift AI application.

---

## 🔧 Environment Variables

Make sure these are set in your Vercel project:

1. Go to **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**

2. Set the following:
   ```
   PUBLIC_BASE_URL=https://driftai.studio
   APP_BASE_URL=https://driftai.studio
   ```

3. Make sure they're set for **Production**, **Preview**, and **Development** environments (or at least Production)

---

## 📞 Twilio Webhook Configuration

In your **Twilio Console**:

1. Go to: **Phone Numbers** → **Manage** → **Active Numbers**
2. Click on your phone number
3. Under **"Voice & Fax"** section:
   - **A CALL COMES IN**: 
     ```
     https://driftai.studio/api/twilio/incoming
     ```
   - **STATUS CALLBACK URL**:
     ```
     https://driftai.studio/api/twilio/status
     ```
4. Set **HTTP Method** to: `POST`
5. Save

---

## ✅ Verification

After setting up:

1. **Test the domain**: Visit `https://driftai.studio` - should load your app
2. **Test Twilio webhooks**: Make a test call to your Twilio number
3. **Check logs**: Verify the webhooks are being received at the correct URLs

---

## 🔄 Code Updates

The code has been updated to use `https://driftai.studio` as the fallback URL in:
- `app/api/twilio/incoming/route.ts`
- `app/api/twilio/response/route.ts`
- `electron/main.js`

The system will:
1. First try `PUBLIC_BASE_URL` environment variable
2. Then try `APP_BASE_URL` environment variable
3. Then try constructing from request headers
4. Finally fallback to `https://driftai.studio`

---

## 📝 Next Steps

1. ✅ Set environment variables in Vercel
2. ✅ Configure Twilio webhooks with new domain
3. ✅ Test voice calls
4. ✅ Verify all features work with new domain

Your app is now configured to use `https://driftai.studio`!


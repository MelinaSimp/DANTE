# Twilio & Vercel URL Configuration Guide

## ✅ What URLs You Need

### 1. **Vercel Production URL** (Required)
Your app is deployed at: **`https://drift-8ikwfg1wo-drift4.vercel.app`**

This is automatically detected, but you can also set it explicitly.

### 2. **Twilio Webhook URLs** (Required)
In your Twilio Console, configure these webhooks for your phone number:

**Voice & Fax → A CALL COMES IN:**
```
https://drift-8ikwfg1wo-drift4.vercel.app/api/twilio/incoming
```

**STATUS CALLBACK URL (optional but recommended):**
```
https://drift-8ikwfg1wo-drift4.vercel.app/api/twilio/status
```

## 🔧 Environment Variables in Vercel

Set these in your Vercel project settings (Settings → Environment Variables):

### Required:
```env
PUBLIC_BASE_URL=https://drift-8ikwfg1wo-drift4.vercel.app
APP_BASE_URL=https://drift-8ikwfg1wo-drift4.vercel.app
```

### Optional (but helpful):
```env
VERCEL_URL=drift-8ikwfg1wo-drift4.vercel.app
```

**Note:** The code automatically detects the URL from the request headers, so these are fallbacks. However, setting them explicitly ensures reliability.

## 🎯 How It Works

1. **Automatic Detection**: The code tries to get the URL from:
   - `PUBLIC_BASE_URL` environment variable (first priority)
   - `APP_BASE_URL` environment variable (second priority)
   - `VERCEL_URL` environment variable (third priority)
   - Request headers (`x-forwarded-host`, `host`) (fourth priority)
   - Hardcoded fallback URL (last resort)

2. **URL Validation**: All URLs are validated before being sent to Twilio to prevent "Invalid URL format" errors.

3. **Error Handling**: If URL construction fails, detailed error messages are logged.

## ✅ Quick Setup Checklist

- [ ] Set `PUBLIC_BASE_URL` in Vercel environment variables
- [ ] Set `APP_BASE_URL` in Vercel environment variables (optional, but recommended)
- [ ] Configure Twilio webhook: `https://drift-8ikwfg1wo-drift4.vercel.app/api/twilio/incoming`
- [ ] Deploy the latest code to Vercel
- [ ] Test a call to your Twilio number

## 🔍 Testing

After deploying, check the Vercel function logs when making a test call. You should see:
```
[Twilio] Using base URL: https://drift-8ikwfg1wo-drift4.vercel.app
[Twilio] Constructed response URL: https://drift-8ikwfg1wo-drift4.vercel.app/api/twilio/response?...
[Twilio] URL validation passed: ...
```

If you see "Invalid URL format" errors, check:
1. The URL is properly formatted (starts with `https://`)
2. No trailing slashes
3. Environment variables are set correctly
4. The deployment is live

## 📝 Notes

- **No custom domain needed**: The Vercel deployment URL works fine
- **HTTPS required**: Twilio requires HTTPS for webhooks
- **URL updates**: If you deploy to a new URL, update the environment variables and Twilio webhooks







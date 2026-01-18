# Complete Setup Guide: Twilio + Vapi Configuration

## 🌐 Base URL

Your Vercel deployment URL:
```
https://drift-1et9oivry-drift4.vercel.app
```

---

## 📞 TWILIO CONFIGURATION

### Step 1: Go to Twilio Console
1. Visit: https://console.twilio.com
2. Navigate to: **Phone Numbers** → **Manage** → **Active Numbers**
3. Click on your phone number: **+1 (216) 350-8215**

### Step 2: Configure Voice Webhooks

In the **Voice & Fax** section:

#### A. A CALL COMES IN:
```
https://drift-1et9oivry-drift4.vercel.app/api/twilio/incoming
```
- **HTTP Method**: `POST`
- ✅ Save

#### B. STATUS CALLBACK URL (Optional but recommended):
```
https://drift-1et9oivry-drift4.vercel.app/api/twilio/status
```
- **HTTP Method**: `POST`
- ✅ Save

### Step 3: Configure SMS Webhooks

In the **Messaging** section:

#### A MESSAGE COMES IN:
```
https://drift-1et9oivry-drift4.vercel.app/api/twilio/sms
```
- **HTTP Method**: `POST`
- ✅ Save

**Important**: Keep SMS enabled in Twilio (we handle SMS through Twilio, not Vapi)

---

## 🤖 VAPI CONFIGURATION

### Step 1: Go to Vapi Dashboard
1. Visit: https://dashboard.vapi.ai
2. Navigate to: **BUILD** → **Assistants**
3. Click on your assistant: **"Drift AI Receptionist"** (ID: `67b7fd78-da19-409e-9fd9-c87edf19c3eb`)

### Step 2: Configure Model Section

In the **Model** section:

#### Provider:
- Select: **OpenAI** (or keep as is)
- Model: **gpt-4o** (or your preferred model)

#### First Message Mode:
- Select: **"Assistant speaks first"**

#### First Message:
- ✅ **LEAVE EMPTY** (no text)

#### System Prompt:
- ✅ **LEAVE EMPTY** (delete any text, including "You are an assistant.")
- ⚠️ **CRITICAL**: This is likely the issue - clear this completely

### Step 3: Configure Server URL

Look for a **"Server URL"** section (might be in Model section or separate):

#### Server URL:
```
https://drift-1et9oivry-drift4.vercel.app/api/vapi/webhook
```

#### Server URL Events / Webhook Events (if available):
Check/enable these events:
- ☑ `request-start` (call initiation)
- ☑ `user` (user messages)
- ☑ `assistant` (assistant requests)
- ☑ `end-of-call-report` (call summary)
- ☑ `status-update` (call status changes)

#### Server URL Timeout:
- Set to: `20` seconds

#### Enable Server URL / Use Server URL:
- ✅ Make sure this is **ON/ENABLED**

### Step 4: Configure Voice Settings

In the **Voice** section:

#### Provider:
- Select: **ElevenLabs**

#### Voice ID:
- Enter: `cgSgspJ2msm6clMCkdW9` (or your agent's voice ID)

#### Model:
- Select: `eleven_turbo_v2_5`

#### Stability:
- Set to: `0.5`

#### Similarity Boost:
- Set to: `0.75`

### Step 5: Save Assistant Configuration
- ✅ Click **"Save"** or **"Update"**

---

## 📱 VAPI PHONE NUMBER CONFIGURATION

### Step 1: Go to Phone Numbers
1. In Vapi Dashboard: **BUILD** → **Phone Numbers**
2. Click on your phone number: **+1 (216) 350-8215** (ID: `c852fcce-4afc-48b3-aa2c-fe361b2b2ac9`)

### Step 2: Link Assistant
- **Assistant**: Select **"Drift AI Receptionist"**

### Step 3: Configure Server URL
- **Server URL**: `https://drift-1et9oivry-drift4.vercel.app/api/vapi/webhook`
- **Timeout**: `20` seconds

### Step 4: Disable SMS (IMPORTANT)
- **SMS**: ✅ **DISABLED** (we use Twilio for SMS)

### Step 5: Save
- ✅ Click **"Save"**

---

## 🔑 VERCEL ENVIRONMENT VARIABLES

### Step 1: Go to Vercel Dashboard
1. Visit: https://vercel.com/dashboard
2. Select your project: **drift-crm**
3. Go to: **Settings** → **Environment Variables**

### Step 2: Add/Verify These Variables

#### VAPI_API_KEY (Optional but recommended):
```
Key: VAPI_API_KEY
Value: 2bf8f671-ccbb-440b-bf7e-9d5985ad3152
Environments: ☑ Production, ☑ Preview, ☑ Development
```

#### PUBLIC_BASE_URL (If not already set):
```
Key: PUBLIC_BASE_URL
Value: https://drift-1et9oivry-drift4.vercel.app
Environments: ☑ Production, ☑ Preview, ☑ Development
```

### Step 3: Redeploy
- Go to **Deployments** tab
- Click **⋯** on latest deployment
- Click **Redeploy**

---

## ✅ VERIFICATION CHECKLIST

### Twilio:
- [ ] Voice webhook: `/api/twilio/incoming` configured
- [ ] Status callback: `/api/twilio/status` configured
- [ ] SMS webhook: `/api/twilio/sms` configured
- [ ] HTTP Method: `POST` for all

### Vapi Assistant:
- [ ] Server URL: `/api/vapi/webhook` configured
- [ ] First Message: **EMPTY**
- [ ] System Prompt: **EMPTY** (CRITICAL!)
- [ ] First Message Mode: "Assistant speaks first"
- [ ] Server URL Events: All enabled (if available)

### Vapi Phone Number:
- [ ] Assistant: Linked to "Drift AI Receptionist"
- [ ] Server URL: `/api/vapi/webhook` configured
- [ ] SMS: **DISABLED**

### Vercel:
- [ ] Environment variables set
- [ ] Deployment redeployed after changes

---

## 🧪 TESTING

### Test 1: Twilio Voice Call
1. Call: **+1 (216) 350-8215**
2. Should hear greeting from your agent
3. Check Vercel logs for: `[Twilio] Incoming call`

### Test 2: Vapi Voice Call (if using Vapi)
1. Call: **+1 (216) 350-8215** (through Vapi)
2. Should hear greeting from webhook
3. Check Vercel logs for: `[Vapi] Call started (request-start)`

### Test 3: SMS
1. Text: **+1 (216) 350-8215**
2. Should receive AI response
3. Check Vercel logs for: `[Twilio SMS] Incoming message`

---

## 🚨 COMMON ISSUES

### Issue: Vapi still uses system message
**Fix**: Clear **System Prompt** field completely in Vapi Assistant settings

### Issue: Webhook not called during call
**Fix**: 
1. Check Server URL Events are enabled
2. Make sure System Prompt is empty
3. Verify Server URL is set at both Assistant AND Phone Number level

### Issue: 400 errors from webhook
**Fix**: Check webhook logs in Vercel to see what's missing

---

## 📞 SUPPORT

If still having issues:
1. Check Vercel logs for detailed error messages
2. Check Vapi call logs for webhook call status
3. Verify all URLs are exactly as shown above (no typos)

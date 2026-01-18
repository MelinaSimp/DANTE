# "Call Cannot Be Completed As Dialed" - Troubleshooting Guide

## ✅ What We Know

Your Vapi phone number is configured:
- **Number**: +1 (216) 350-8215
- **Status**: Active
- **Assistant ID**: 8b192691-bcec-4f2c-b1e1-7d8a3133411f
- **Provider**: Twilio

## 🔍 Common Causes

The error "call cannot be completed as dialed" typically means:

1. **Phone number not properly imported into Vapi from Twilio**
2. **Twilio number not active or not properly configured**
3. **Phone number not linked to Twilio account correctly**
4. **Trial account restrictions** (if Twilio account is in trial mode)
5. **Regional/carrier issue** (number might not support incoming calls)

## 🔧 Troubleshooting Steps

### Step 1: Check Twilio Number Status

1. Go to **Twilio Console**: https://console.twilio.com
2. Navigate to: **Phone Numbers** → **Manage** → **Active Numbers**
3. Find: **+1 (216) 350-8215**
4. Check:
   - [ ] Number status is **"Active"**
   - [ ] Number has **Voice capability** enabled
   - [ ] Number is assigned to your Twilio account
   - [ ] Number is not restricted or suspended

### Step 2: Check Vapi Phone Number Import

1. Go to **Vapi Dashboard**: https://dashboard.vapi.ai
2. Navigate to: **BUILD** → **Phone Numbers**
3. Find: **+1 (216) 350-8215**
4. Check:
   - [ ] Number shows as **"Active"**
   - [ ] Assistant is linked: **"Drift AI Receptionist"** (8b192691-bcec-4f2c-b1e1-7d8a3133411f)
   - [ ] Server URL is set: `https://drift-1et9oivry-drift4.vercel.app/api/vapi/webhook`
   - [ ] Provider shows **"twilio"**

### Step 3: Verify Twilio → Vapi Connection

The phone number should be:
1. **Owned by Twilio** (in your Twilio account)
2. **Imported into Vapi** (using "Import from Twilio" in Vapi)
3. **Linked to your Assistant** (in Vapi phone number settings)

### Step 4: Check Twilio Account Status

1. Go to **Twilio Console** → **Settings** → **Account**
2. Check:
   - [ ] Account is **not** in trial mode (or trial restrictions are lifted)
   - [ ] Account has **sufficient balance** for voice calls
   - [ ] Account is **not suspended** or restricted

### Step 5: Try Re-importing the Number

If the number was imported incorrectly:

1. In **Vapi Dashboard** → **Phone Numbers**
2. Click on **+1 (216) 350-8215**
3. Look for **"Re-import from Twilio"** or **"Refresh"** option
4. Or delete and re-import:
   - Delete the number in Vapi
   - Go to **Phone Numbers** → **Import from Twilio**
   - Select **+1 (216) 350-8215**
   - Re-link to Assistant **8b192691-bcec-4f2c-b1e1-7d8a3133411f**

### Step 6: Check Twilio Webhook Configuration

Even though we're using Vapi, the number still needs Twilio webhook configured:

1. In **Twilio Console** → **Phone Numbers** → **+1 (216) 350-8215**
2. Under **Voice & Fax** → **A CALL COMES IN**:
   - Should be set to Vapi's Twilio webhook: `https://api.vapi.ai/twilio/inbound_call`
   - OR leave empty if Vapi handles it automatically

**Important**: Vapi might override Twilio webhooks when you import the number. Check what's configured.

### Step 7: Test with a Different Number

If you have another Twilio number:
1. Try importing a different number into Vapi
2. Test if that number works
3. This will tell us if it's a specific number issue or a general Vapi/Twilio issue

---

## 🚨 Quick Fixes to Try

### Fix 1: Verify Number Format

Make sure you're dialing the number correctly:
- ✅ Correct: `+1 (216) 350-8215` or `12163508215`
- ❌ Wrong: `216-350-8215` (missing country code)

### Fix 2: Check Caller ID Restrictions

If your phone/carrier has caller ID restrictions:
- Try calling from a different phone
- Try calling from a landline
- Try calling from a different carrier

### Fix 3: Check Vapi Phone Number Settings

In Vapi Dashboard → Phone Numbers → +1 (216) 350-8215:
- **Status**: Should be "Active"
- **Assistant**: Should be linked to "Drift AI Receptionist"
- **Server URL**: Should be set correctly
- **SMS**: Should be disabled

### Fix 4: Check Twilio Number Capabilities

In Twilio Console → Phone Numbers → +1 (216) 350-8215:
- **Voice**: Should be enabled
- **Status**: Should be "Active"
- **Capabilities**: Should show "Voice" as enabled

---

## 💡 Most Likely Issues

1. **Number not properly imported from Twilio to Vapi**
   - Solution: Re-import the number in Vapi

2. **Twilio account restrictions** (trial mode, insufficient balance)
   - Solution: Check Twilio account status and billing

3. **Regional/carrier issue** (number might not support incoming calls)
   - Solution: Check Twilio number capabilities

4. **Vapi phone number not fully activated**
   - Solution: Verify all settings in Vapi dashboard

---

## 🔗 Support Resources

- **Vapi Support**: Check Vapi dashboard for support chat/email
- **Twilio Support**: Check Twilio console for support options
- **Vapi Documentation**: https://docs.vapi.ai
- **Twilio Documentation**: https://www.twilio.com/docs/voice

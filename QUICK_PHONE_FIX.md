# Quick Fix: "Call Cannot Be Completed As Dialed"

## ✅ Vapi Configuration is Correct

Your Vapi phone number is configured correctly:
- Number: **+1 (216) 350-8215**
- Status: **Active**
- Assistant: **Linked** (8b192691-bcec-4f2c-b1e1-7d8a3133411f)
- Server URL: **Set correctly**

## 🔍 The Issue

This error is typically caused by:
1. **Phone number not properly imported from Twilio to Vapi**
2. **Twilio account restrictions** (trial mode, insufficient balance)
3. **Twilio number not active or has restrictions**
4. **Number format issue** when dialing

## 🚀 Quick Fixes to Try

### Fix 1: Re-import Phone Number in Vapi

1. Go to **Vapi Dashboard**: https://dashboard.vapi.ai
2. Navigate to: **BUILD** → **Phone Numbers**
3. Click on **+1 (216) 350-8215**
4. Look for **"Re-import from Twilio"** or **"Refresh"** button
5. If not available, try:
   - Delete the number in Vapi (don't worry, it won't delete from Twilio)
   - Go to **Phone Numbers** → **Import from Twilio**
   - Select **+1 (216) 350-8215** from your Twilio numbers
   - Re-link to Assistant **8b192691-bcec-4f2c-b1e1-7d8a3133411f**
   - Set Server URL: `https://drift-1et9oivry-drift4.vercel.app/api/vapi/webhook`

### Fix 2: Check Twilio Number Status

1. Go to **Twilio Console**: https://console.twilio.com
2. Navigate to: **Phone Numbers** → **Manage** → **Active Numbers**
3. Find: **+1 (216) 350-8215**
4. Check:
   - **Status**: Should be "Active"
   - **Voice**: Should be enabled
   - **Account**: Should be your account
   - **Capabilities**: Should show "Voice" as available

### Fix 3: Check Twilio Account Status

1. Go to **Twilio Console** → **Settings** → **Account**
2. Check:
   - **Account Status**: Should not be "Trial" (or trial restrictions should be lifted)
   - **Balance**: Should have sufficient balance for voice calls
   - **Status**: Should be "Active" (not suspended)

### Fix 4: Check Number Format When Dialing

Make sure you're dialing the number correctly:
- ✅ **Correct**: `+1 (216) 350-8215` or `12163508215` or `(216) 350-8215`
- ❌ **Wrong**: Missing country code, wrong format

### Fix 5: Try from a Different Phone

- Call from a different phone/carrier
- Try calling from a landline
- This will help determine if it's a carrier-specific issue

---

## 🔧 What to Check in Vapi Dashboard

1. **Phone Number** → **Status**: Should be "Active"
2. **Phone Number** → **Assistant**: Should be "Drift AI Receptionist" (8b192691-bcec-4f2c-b1e1-7d8a3133411f)
3. **Phone Number** → **Server URL**: Should be `https://drift-1et9oivry-drift4.vercel.app/api/vapi/webhook`
4. **Phone Number** → **Provider**: Should be "Twilio"

---

## 🔧 What to Check in Twilio Console

1. **Phone Numbers** → **+1 (216) 350-8215** → **Status**: Should be "Active"
2. **Phone Numbers** → **+1 (216) 350-8215** → **Capabilities**: Should show "Voice" enabled
3. **Account** → **Settings**: Check for restrictions or trial limitations
4. **Account** → **Balance**: Should have sufficient balance

---

## 💡 Most Likely Solution

**Re-import the phone number from Twilio to Vapi:**

1. In Vapi Dashboard → Phone Numbers → Delete +1 (216) 350-8215
2. Click **"Import from Twilio"**
3. Select **+1 (216) 350-8215**
4. Link to Assistant: **8b192691-bcec-4f2c-b1e1-7d8a3133411f**
5. Set Server URL: `https://drift-1et9oivry-drift4.vercel.app/api/vapi/webhook`
6. Save

This ensures the number is properly connected between Twilio and Vapi.

---

## 📞 Test After Fix

After re-importing:
1. Wait 1-2 minutes for changes to propagate
2. Call: **+1 (216) 350-8215**
3. You should hear your assistant's greeting
4. Check Vercel logs for: `[Vapi] Call started (request-start)`

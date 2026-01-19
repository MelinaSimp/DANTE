# Fix: "The number you have dialed has calling restrictions"

## 🔍 What This Error Means

This is a **Twilio error**, not from our code. Twilio is blocking the call before it reaches our webhook.

## ✅ Common Causes & Fixes

### 1. **Trial Account Restrictions** (Most Common)

**If your Twilio account is in Trial mode:**
- You can **only call verified phone numbers**
- You **cannot receive calls** from unverified numbers
- You **cannot call unverified numbers**

**Fix:**
1. Go to **Twilio Console** → **Settings** → **General**
2. Check if your account shows **"Trial"** status
3. **Upgrade to a paid account** OR **Verify the phone number you're calling from**:
   - Go to **Phone Numbers** → **Verified Caller IDs**
   - Click **"Add a new Caller ID"**
   - Enter your phone number
   - Verify it via SMS or call

### 2. **Geographic Restrictions**

**Check if your number has geographic restrictions:**
1. Go to **Phone Numbers** → **Manage** → **Active Numbers**
2. Click on your number
3. Check **"Geographic Permissions"** section
4. Make sure your country/region is allowed

**Fix:**
- Remove geographic restrictions OR
- Add your country to allowed regions

### 3. **Number Doesn't Support Voice**

**Check number capabilities:**
1. Go to **Phone Numbers** → **Manage** → **Active Numbers**
2. Click on your number
3. Go to **"Properties"** tab
4. Check **"Capabilities"** section
5. Make sure **"Voice"** is listed

**If Voice is NOT listed:**
- You need to release this number and buy a new one with Voice capability

### 4. **Calling from Restricted Number**

**If you're calling from:**
- A blocked/restricted number
- A number in a restricted country
- An unverified number (on trial account)

**Fix:**
- Verify your caller ID in Twilio
- Use a different phone number to test
- Upgrade from trial account

## 🎯 Quick Checklist

1. **Check Account Status:**
   - [ ] Is account in Trial mode?
   - [ ] If yes, verify your caller ID OR upgrade account

2. **Check Number Capabilities:**
   - [ ] Does number show "Voice" capability?
   - [ ] If no, buy a new number with Voice

3. **Check Geographic Restrictions:**
   - [ ] Are there geographic restrictions?
   - [ ] Is your country/region allowed?

4. **Verify Caller ID:**
   - [ ] Is the number you're calling FROM verified in Twilio?
   - [ ] If on trial, you MUST verify it

## 📞 How to Verify Your Caller ID (Trial Accounts)

1. Go to **Twilio Console** → **Phone Numbers** → **Verified Caller IDs**
2. Click **"Add a new Caller ID"**
3. Enter your phone number (the one you're calling FROM)
4. Choose verification method:
   - **SMS**: You'll receive a code via text
   - **Call**: You'll receive a call with a code
5. Enter the verification code
6. Your number is now verified ✅

**After verification, you can call your Twilio number from that phone.**

## 🚀 Upgrade from Trial (Recommended for Production)

If you want to receive calls from ANY number (not just verified ones):

1. Go to **Twilio Console** → **Settings** → **General**
2. Click **"Upgrade Account"**
3. Add payment method
4. Your account will be upgraded
5. You can now receive calls from any number

## ⚠️ Important Notes

- **Trial accounts** are limited to verified numbers only
- **Toll-free numbers** (800, 888, etc.) usually have fewer restrictions
- **Local numbers** may have geographic restrictions
- **Some countries** have additional restrictions

## 🔍 Test After Fixing

1. Make sure your caller ID is verified (if on trial)
2. Call your Twilio number
3. You should hear the greeting (not the restriction error)
4. Check Railway logs to see if the call reaches the webhook

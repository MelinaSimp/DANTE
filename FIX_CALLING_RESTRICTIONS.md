# Fix "Calling Restrictions" Error

## 🚨 The Error
"The number you have dialed has calling restrictions"

This is a **Twilio account-level restriction**, not a code issue.

## ✅ Step-by-Step Fix

### 1. Check Twilio Account Status

**In Twilio Console:**
1. Go to: **Account** → **Usage & Billing**
2. Check:
   - [ ] Account is **not suspended**
   - [ ] Account has **positive balance** or valid payment method
   - [ ] Account is **not on trial** (or trial restrictions are lifted)

### 2. Check Geographic Permissions

**In Twilio Console:**
1. Go to: **Voice** → **Settings** → **Geo-Permissions**
2. Check if your country/region is **allowed**
3. If not, **enable it** and click **Save**

**This is the #1 cause of "calling restrictions" on paid accounts!**

### 3. Check Phone Number Capabilities

**In Twilio Console:**
1. Go to: **Phone Numbers** → **Manage** → **Active Numbers**
2. Click your phone number
3. Check **"Capabilities"** section:
   - [ ] **Voice** should be **enabled**
   - [ ] **SMS** (if needed) should be **enabled**

### 4. Verify Phone Number Status

**In Twilio Console:**
1. Same phone number page
2. Check **"Status"**:
   - Should be **"Active"**
   - Not **"Released"** or **"Pending"**

### 5. Check Regulatory Compliance

**In Twilio Console:**
1. Go to: **Phone Numbers** → **Regulatory Compliance**
2. Check if there are any **pending verifications**
3. Complete any required verifications

### 6. Check Call Logs for Specific Error Code

**In Twilio Console:**
1. Go to: **Monitor** → **Logs** → **Calls**
2. Find your recent call attempt
3. Click on it
4. **Look for the error code** - this will tell us exactly why it's restricted

**Common error codes:**
- **21211** = Invalid phone number
- **21408** = Permission denied (geographic restriction)
- **20003** = Unreachable destination
- **13216** = Media Stream connection failed (but this shouldn't cause "restrictions")

## 🔧 Quick Test

**Try calling from a different number:**
- If it works from another number = geographic restriction on your number
- If it still fails = account-level restriction

## 📋 Most Likely Fix

**Geographic Permissions** - This is the #1 cause:
1. Twilio Console → Voice → Settings → Geo-Permissions
2. Enable your country/region
3. Click Save
4. Try calling again

## ⚠️ Important Note

Even though your webhook is being called (we see it in Vercel logs), Twilio can still reject the call **after** receiving the TwiML if:
- The account has restrictions
- Geographic permissions block the call
- The phone number has restrictions

The webhook being called doesn't mean the call will complete - Twilio can still reject it for account-level reasons.

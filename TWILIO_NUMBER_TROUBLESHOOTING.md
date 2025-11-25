# Twilio Number Configuration Troubleshooting

## ❌ Problem: "Voice configuration is unavailable for this phone number"

This means your Twilio phone number **doesn't support voice calls**. This is a common issue.

---

## 🔍 Why This Happens

### Common Reasons:

1. **Wrong Number Type**: The number might be a landline or a number type that only supports SMS
2. **Carrier Restrictions**: Some numbers have carrier-imposed restrictions
3. **Number Not Fully Provisioned**: The number might still be activating
4. **Regional Restrictions**: Some regions have limitations

---

## ✅ Solutions

### Solution 1: Release and Buy a New Number (Recommended)

**The easiest fix is to get a new number that supports voice:**

1. **Release the Current Number:**
   - In Twilio Console → Phone Numbers → Manage → Active Numbers
   - Click on your number: **(216) 677-0276**
   - Click **"Release"** button
   - Confirm the release

2. **Buy a New Voice-Enabled Number:**
   - Go to: **Phone Numbers** → **Manage** → **Buy a number**
   - **Important**: Make sure to check:
     - ✅ **Voice** capability (must be checked!)
     - ✅ **SMS** capability (optional, but recommended)
   - Search for numbers
   - Select a number that shows **Voice** capability
   - Purchase it

3. **Verify the New Number:**
   - Go to the new number's configuration page
   - You should see **"Voice & Fax"** section (not "Voice configuration is unavailable")
   - You should be able to configure webhooks

### Solution 2: Check Number Capabilities

1. Go to: **Phone Numbers** → **Manage** → **Active Numbers**
2. Click on your number
3. Go to **"Properties"** tab
4. Look for **"Capabilities"** section
5. Check if **"Voice"** is listed

If Voice is NOT in the capabilities, you need a new number.

---

## 🎯 What to Look For When Buying a Number

When purchasing a new number in Twilio:

### ✅ Good Number (Supports Voice):
- Capabilities show: **Voice**, **SMS** (optional)
- Configuration page shows: **"Voice & Fax"** section
- You can set webhooks for incoming calls

### ❌ Bad Number (No Voice):
- Shows: "Voice configuration is unavailable"
- No "Voice & Fax" section
- Cannot configure webhooks

---

## 📝 Step-by-Step: Buy a Voice-Enabled Number

1. **Go to Twilio Console**
   - Navigate to: **Phone Numbers** → **Manage** → **Buy a number**

2. **Search for Numbers**
   - Select your country (United States)
   - Select your area code or search by city
   - **IMPORTANT**: In the filters, make sure:
     - ✅ **Voice** is checked
     - ✅ **SMS** is checked (optional but recommended)

3. **Select a Number**
   - Look for numbers that show **Voice** capability
   - Click **"Buy"** on a number

4. **Configure the Number**
   - After purchase, go to the number's configuration page
   - Under **"Voice & Fax"** section:
     - **A CALL COMES IN**: `https://driftai.studio/api/twilio/incoming`
     - **STATUS CALLBACK URL**: `https://driftai.studio/api/twilio/status`
   - Set **HTTP Method** to: `POST`
   - Click **"Save configuration"**

5. **Update Your Agent**
   - Go to your agent builder
   - Go to **Advanced** tab
   - Update the phone number to the new number (format: `+12166770276` or `+1XXXXXXXXXX`)

---

## 🔍 Verify Your Number Supports Voice

After getting a new number, verify it works:

1. **Check Configuration Page:**
   - Should show **"Voice & Fax"** section (not "unavailable")
   - Should allow you to set webhook URLs

2. **Test the Number:**
   - Call the number from your phone
   - You should hear your greeting (if agent is deployed)
   - Or you should get a response (even if it's an error, that means voice works)

---

## 💡 Pro Tips

1. **Always Check Capabilities**: When buying numbers, make sure Voice is listed
2. **Use Twilio's Search Filters**: Filter by "Voice" capability when searching
3. **Toll-Free Numbers**: Toll-free numbers (800, 888, etc.) usually support voice
4. **Local Numbers**: Some local numbers may have restrictions - check capabilities

---

## 🚨 If You Still Can't Configure

If you've tried buying a new number and it still doesn't work:

1. **Contact Twilio Support:**
   - Go to: Twilio Console → Help & Support
   - Explain that you need a voice-enabled number for your receptionist

2. **Check Your Twilio Account:**
   - Make sure your account is fully verified
   - Some features require account verification

3. **Try a Different Number Type:**
   - Try a toll-free number (800, 888, 877, etc.)
   - These usually have fewer restrictions

---

## ✅ Quick Checklist

- [ ] Current number shows "Voice configuration unavailable" ❌
- [ ] Release the current number
- [ ] Buy a new number with **Voice** capability checked
- [ ] Verify new number shows "Voice & Fax" section ✅
- [ ] Configure webhooks:
  - [ ] Incoming: `https://driftai.studio/api/twilio/incoming`
  - [ ] Status: `https://driftai.studio/api/twilio/status`
- [ ] Update phone number in agent Advanced settings
- [ ] Test by calling the number

---

**The key is: You need a number that explicitly supports Voice capability. If your current number doesn't, you'll need to get a new one.**


# Vapi Configuration Fix Guide

## 🎯 Goal

Fix Vapi configuration so it actually uses your webhook for real-time conversations instead of only calling it after calls end.

---

## 📋 Step-by-Step Fix Process

### Step 1: Diagnose Current Configuration

First, let's check what's wrong:

```bash
VAPI_API_KEY=your_key node scripts/diagnose-vapi.js
```

This will show you:
- ✅ What's configured correctly
- ⚠️  What needs attention
- ❌ Critical issues that need fixing

**Expected output:** A detailed report of your configuration

---

### Step 2: Fix Configuration Automatically

Run the fix script:

```bash
VAPI_API_KEY=your_key node scripts/fix-vapi-config.js [assistantId]
```

**If you don't provide assistantId, it will use your first assistant.**

This script will:
1. ✅ Set `model: null` (CRITICAL - forces Server URL mode)
2. ✅ Set `serverUrl` to your webhook URL
3. ✅ Clear `firstMessage` (empty string)
4. ✅ Set `firstMessageMode: "assistant-speaks-first"`
5. ✅ Update phone number Server URL if linked

---

### Step 3: Verify Fix in Vapi Dashboard

**Go to Vapi Dashboard** → Your Assistant:

1. **Check Model Settings:**
   - Model should show as "Custom" or "Server URL"
   - Messages array should be empty `[]`
   - System prompt can be anything (it's ignored)

2. **Check Server URL:**
   - Should be: `https://drift-8wxgu825o-drift4.vercel.app/api/vapi/webhook`
   - Or your custom domain if you have one

3. **Check First Message:**
   - Should be empty or blank

4. **Check Phone Number:**
   - Server URL should match assistant Server URL
   - Phone number should be linked to assistant

---

### Step 4: Test the Configuration

1. **Make a test call** to your Vapi phone number

2. **Check Vercel logs** (real-time):
   ```bash
   vercel logs --follow | grep -i vapi
   ```

3. **What you should see:**
   ```
   ✅ [Vapi] Call started (request-start)
   ✅ [Vapi] User message received
   ✅ [Vapi] Returning response with voice
   ✅ [Vapi] User message received (multiple times)
   ✅ [Vapi] Returning response (multiple times)
   ✅ [Vapi] End-of-call-report received
   ```

4. **What you DON'T want to see:**
   ```
   ❌ Only "End-of-call-report" messages
   ❌ No "request-start" messages
   ❌ No "User message received" messages
   ```

---

### Step 5: If It Still Doesn't Work

#### Issue 1: Only seeing `end-of-call-report`

**Cause:** Vapi dashboard has a setting that can't be changed via API.

**Fix:**
1. Go to Vapi Dashboard → Your Assistant
2. Look for "Server Messages" or "Server Events" section
3. Enable ALL events:
   - ✅ `request-start`
   - ✅ `user-message`
   - ✅ `assistant-message`
   - ✅ `function-call`
   - ✅ `status-update`
4. Save and test again

#### Issue 2: Getting 400 "Missing call information" errors

**Cause:** Webhook can't extract call ID from Vapi's payload.

**Fix:**
1. Check Vercel logs for the actual payload structure
2. Look for `[Vapi] Full request-start body:` in logs
3. The webhook handler might need updating if Vapi changed their format
4. Share the logs and we can fix the webhook handler

#### Issue 3: Webhook not being called at all

**Cause:** Network/firewall or incorrect URL.

**Fix:**
1. Test webhook manually:
   ```bash
   curl -X POST https://drift-8wxgu825o-drift4.vercel.app/api/vapi/webhook \
     -H "Content-Type: application/json" \
     -d '{"test": "connection"}'
   ```
2. Should return a response (even if it's an error)
3. If 404/500, webhook deployment issue
4. If timeout, firewall/network issue

---

## 🔍 Manual Dashboard Check

If the scripts don't work, manually verify these in Vapi Dashboard:

### Assistant Settings:
- [ ] Model: Set to "Custom" or "Server URL" (not "OpenAI" or other)
- [ ] Messages: Empty array `[]`
- [ ] Server URL: `https://your-domain.com/api/vapi/webhook`
- [ ] First Message: Empty
- [ ] First Message Mode: "assistant-speaks-first"

### Phone Number Settings:
- [ ] Server URL: Same as assistant Server URL
- [ ] Linked to: Your assistant
- [ ] Status: Active/Enabled

### Advanced Settings (if available):
- [ ] Server Messages: Enabled
- [ ] Server Events: Enabled
- [ ] Use Server URL for all messages: Enabled

---

## 🧪 Testing Checklist

After fixing configuration:

- [ ] Made a test call to Vapi number
- [ ] Checked Vercel logs for `[Vapi]` entries
- [ ] Saw `request-start` message in logs
- [ ] Saw `user message received` messages in logs
- [ ] Saw `returning response` messages in logs
- [ ] Assistant actually responds during the call
- [ ] Assistant uses your scenarios (not Vapi's default)

---

## 🆘 Still Not Working?

If it's still not working after all these steps:

1. **Share Vercel logs** from a test call
2. **Share Vapi call logs** (from Vapi dashboard)
3. **Share output** from diagnose script
4. **Check Vapi support** - might be a platform issue

---

## 📝 Quick Reference

**Diagnose:**
```bash
VAPI_API_KEY=your_key node scripts/diagnose-vapi.js
```

**Fix:**
```bash
VAPI_API_KEY=your_key node scripts/fix-vapi-config.js [assistantId]
```

**Test Webhook:**
```bash
curl -X POST https://drift-8wxgu825o-drift4.vercel.app/api/vapi/webhook \
  -H "Content-Type: application/json" \
  -d '{"message": {"type": "request-start"}, "call": {"id": "test123"}}'
```

**Check Logs:**
```bash
vercel logs --follow | grep -i vapi
```

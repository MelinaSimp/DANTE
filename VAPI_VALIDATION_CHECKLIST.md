# Vapi Validation Checklist

## ✅ What We Just Fixed

### 1. **Response Format** (CRITICAL)
- ✅ Changed from `{ response: "..." }` to `{ messages: [{ role: "assistant", content: "..." }] }`
- ✅ This is the format Vapi expects for Server URL responses
- ✅ Updated `formatVapiResponse()` to return both formats for compatibility

### 2. **Request-Start Handling** (CRITICAL)
- ✅ Now responds DIRECTLY to `request-start` (doesn't convert to system message)
- ✅ Responds IMMEDIATELY (< 2 seconds)
- ✅ Creates conversation in background (fire-and-forget)
- ✅ Returns greeting in correct format

### 3. **Response Timing** (CRITICAL)
- ✅ Request-start handler responds before any slow DB operations
- ✅ Conversation creation is fire-and-forget (doesn't block response)

---

## 🧪 Testing Steps

### Step 1: Test Minimal Endpoint First

1. **Temporarily set Server URL to test endpoint:**
   - Go to Vapi Dashboard → Assistant → Server URL
   - Change to: `https://drift-1et9oivry-drift4.vercel.app/api/vapi/test-minimal`
   - Save

2. **Make a test call**
   - Should hear: "Hi! How can I help you today?"
   - Check Vercel logs for `[Vapi Test]` entries

3. **If this works:**
   - ✅ Response format is correct
   - ✅ Vapi IS calling webhook during calls
   - → Switch back to main webhook: `/api/vapi/webhook`

4. **If this doesn't work:**
   - ❌ Vapi still not calling webhook
   - → Check dashboard settings (see below)

---

### Step 2: Check Vapi Dashboard Settings

Go through these systematically:

#### A. Assistant Settings
- [ ] **Server URL**: Set to your webhook URL
- [ ] **Model → Messages**: Should be EMPTY `[]`
- [ ] **Model → System Prompt**: Should be EMPTY or not set
- [ ] **First Message**: Should be EMPTY
- [ ] **First Message Mode**: `assistant-speaks-first`
- [ ] **Look for any toggle**: "Use Vapi model" or "Fallback model" - should be OFF/DISABLED

#### B. Phone Number Settings
- [ ] **Server URL**: Should match assistant Server URL
- [ ] **Assistant**: Linked to your assistant
- [ ] **Assistant ID**: Should NOT be null (must be linked)
- [ ] **SMS**: DISABLED

#### C. Advanced/Server Settings (if exists)
- [ ] **Server Messages/Events**: Should include:
  - `request-start`
  - `user`
  - `assistant`
  - `end-of-call-report`
- [ ] **Enable Server URL**: Should be ON/ENABLED
- [ ] **Server URL Priority**: Should be set correctly

---

### Step 3: Test Full Webhook

After minimal test works:

1. **Set Server URL back to main webhook:**
   - `https://drift-1et9oivry-drift4.vercel.app/api/vapi/webhook`

2. **Make a test call**

3. **Check Vercel logs** - You should see:
   ```
   [Vapi] Call started (request-start) - Responding directly
   [Vapi] Returning direct response to request-start
   [Vapi] User message received
   [Vapi] Returning response with voice
   ```

4. **If you see all of these:**
   - ✅ Vapi is working!
   - ✅ Your webhook is handling the conversation

5. **If you only see end-of-call-report:**
   - ❌ Vapi still not calling during call
   - → Check dashboard settings above
   - → Contact Vapi support

---

## 🔍 What to Look For in Logs

### Success Pattern:
```
[Vapi] Call started (request-start) - Responding directly
[Vapi] Returning direct response to request-start: { "messages": [...] }
[Vapi] User message received: "Hello"
[Vapi] Returning response with voice: { "messages": [...] }
[Vapi] End-of-call-report received
```

### Failure Pattern (Current):
```
[Vapi] End-of-call-report received
[Vapi] Missing call information
```

---

## 🎯 Response Format Requirements

### ✅ CORRECT Format:
```json
{
  "messages": [
    {
      "role": "assistant",
      "content": "Hello! How can I help you today?"
    }
  ]
}
```

### ❌ WRONG Formats:
```json
{ "response": "Hello!" }  // Wrong - Vapi ignores this
{ "role": "system", ... }  // Wrong - Vapi ignores this
{ "text": "Hello!" }       // Wrong - Vapi ignores this
```

---

## ⚡ Performance Requirements

- **Response time**: < 2 seconds (CRITICAL)
- **No streaming**: Must return complete JSON
- **No async blocking**: Don't wait for DB writes
- **Fire-and-forget**: Background operations only

---

## 🚨 If Still Not Working

1. **Try minimal endpoint first** - confirms response format
2. **Check dashboard thoroughly** - look for hidden toggles
3. **Contact Vapi support** with:
   - Assistant ID: `67b7fd78-da19-409e-9fd9-c87edf19c3eb`
   - Issue: Server URL set but not called during calls
   - Evidence: Only receiving end-of-call-report
   - Response format: Using `{ messages: [...] }` format

4. **Consider alternatives**:
   - Optimize Twilio (4-6 hours, same latency)
   - Try Retell AI (similar to Vapi, better docs)

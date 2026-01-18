# Deep Analysis: Vapi Integration Issue

## 🔍 Problem Summary

**Symptom:** Vapi is only sending `end-of-call-report` messages to the webhook, NOT calling it during the call for real-time conversation events (`request-start`, `user`, `assistant` messages).

**Impact:** The assistant uses Vapi's default model instead of our webhook, so our custom AgentExecutor logic never runs.

---

## ✅ What We've Tried (Complete List)

### 1. **Assistant Configuration via API**
- ✅ Set `serverUrl` to our webhook URL
- ✅ Cleared `model.messages` (set to empty array `[]`)
- ✅ Cleared `firstMessage` (set to empty string)
- ✅ Set `firstMessageMode` to `"assistant-speaks-first"`
- ✅ Kept voice settings (ElevenLabs configured)

### 2. **Phone Number Configuration via API**
- ✅ Set `server.url` to our webhook URL
- ✅ Fixed truncated URL (was `/api/vapi/webhoo`, now `/api/vapi/webhook`)
- ✅ Linked phone number to assistant

### 3. **Webhook Handler Improvements**
- ✅ Added handling for `end-of-call-report` (works correctly)
- ✅ Added handling for `request-start` messages
- ✅ Added handling for `function-call` messages
- ✅ Added handling for `speech-update` and `status-update`
- ✅ Added extensive logging to debug payload structure
- ✅ Improved call information extraction (checks multiple locations)
- ✅ Added fallback logic for missing call info

### 4. **Custom Function/Tool Configuration**
- ✅ Created `handle_conversation` custom function
- ✅ Configured function parameters
- ✅ Set function Server URL
- ✅ Tried adding Vapi variables (`{{call.id}}`) to parameters
- ❌ Removed custom function (didn't help)

---

## 🔴 What's Actually Happening

### Evidence from Logs:

1. **Vapi IS calling the webhook** ✅
   - We see logs: `[Vapi] Webhook received`
   - We see `end-of-call-report` messages

2. **Vapi is NOT calling during the call** ❌
   - No `request-start` messages
   - No `user` messages
   - No `assistant` messages
   - Only `end-of-call-report` after call ends

3. **Webhook returns errors** ❌
   - When called, webhook returns 400 "Missing call information"
   - This might cause Vapi to stop using the webhook

### The Vicious Cycle:

```
Call starts → Vapi should call webhook with request-start
    ↓
Vapi doesn't call webhook (uses own model instead)
    ↓
Call continues with Vapi's default model
    ↓
Call ends → Vapi calls webhook with end-of-call-report
    ↓
Webhook returns 400 error (can't find call info)
    ↓
Vapi stops trusting the webhook
```

---

## 🤔 Root Cause Analysis

### Hypothesis 1: Vapi Configuration Issue (MOST LIKELY)

**Theory:** Vapi requires a dashboard setting that can't be set via API.

**Evidence:**
- API configuration looks correct
- User says there's no "Server Messages/Events" toggle in dashboard
- Vapi documentation mentions these settings exist
- Other users report similar issues resolved by dashboard changes

**What might be missing:**
- Server URL "Events" or "Messages" configuration
- A toggle to "Enable Server URL for all messages"
- A setting to "Use Server URL instead of model"

### Hypothesis 2: Response Format Issue

**Theory:** Vapi expects a specific response format for `request-start` that we're not providing.

**Evidence:**
- We handle `request-start` but convert it to system message
- Maybe Vapi needs a direct response to `request-start` before it will continue
- If we return an error or wrong format, Vapi might stop using webhook

**What we're doing:**
```typescript
if (body.message?.type === "request-start") {
  // Convert to system message and continue
  body.message = { role: "system", type: "system" };
  // Continue to system message handler
}
```

**What Vapi might expect:**
- Direct response to `request-start` with greeting
- Specific response format
- Success acknowledgment before continuing

### Hypothesis 3: Vapi Bug or Behavior Change

**Theory:** Vapi has a bug or changed behavior where Server URL isn't used even when configured.

**Evidence:**
- Multiple users report similar issues
- Vapi support forums have unresolved threads
- Configuration looks correct but doesn't work

### Hypothesis 4: First Message Mode Issue

**Theory:** `firstMessageMode: "assistant-speaks-first"` might require a `firstMessage` to be set, or Vapi handles it differently.

**Evidence:**
- We set `firstMessageMode` but `firstMessage` is empty
- Maybe Vapi needs `firstMessageMode: "server-speaks-first"` or similar
- Or maybe empty `firstMessage` causes Vapi to skip Server URL

---

## 🎯 What We Haven't Tried Yet

### 1. **Direct Response to request-start**
Instead of converting to system message, respond directly:

```typescript
if (body.message?.type === "request-start") {
  // Find agent, create conversation, return greeting immediately
  const greeting = "Hello! How can I help you today?";
  return NextResponse.json({
    response: greeting,
    endCall: false,
  });
}
```

### 2. **Check Vapi Dashboard for Hidden Settings**
- Look for "Server URL Events" section
- Check if there's a "Enable Server URL" toggle
- Look for "Message Routing" or "Response Source" settings

### 3. **Try Different firstMessageMode Values**
- `"server-speaks-first"` (if exists)
- `"assistant-speaks-first"` (current)
- Remove `firstMessageMode` entirely

### 4. **Set a Minimal firstMessage**
Maybe Vapi needs SOMETHING in `firstMessage`:

```typescript
firstMessage: " ", // Single space instead of empty
```

### 5. **Check if Model Needs Explicit Server Configuration**
Maybe the model needs:
```typescript
model: {
  server: {
    url: serverUrl,
  },
  messages: [],
}
```

(We tried this but API rejected it - `model.server` is read-only)

### 6. **Contact Vapi Support with Specific Details**
- Assistant ID: `67b7fd78-da19-409e-9fd9-c87edf19c3eb`
- Issue: Server URL set but not called during calls
- Configuration: Server URL set, messages empty, firstMessageMode set
- Evidence: Only receiving end-of-call-report, not request-start or user messages

---

## 💡 Key Insights

### 1. **The Configuration is Correct (Probably)**
- Server URL is set correctly
- Messages are empty (forces Server URL usage)
- Phone number is linked correctly
- All API calls succeed

### 2. **The Problem is Vapi's Behavior, Not Our Code**
- Vapi is choosing NOT to call the webhook during calls
- This suggests a Vapi-side configuration or bug
- Our webhook code is fine (it handles what it receives)

### 3. **The Error Loop Might Be Making It Worse**
- Webhook returns 400 errors for `end-of-call-report`
- This might cause Vapi to distrust the webhook
- But this is a symptom, not the cause (Vapi wasn't calling during calls anyway)

### 4. **We Need to See What Vapi Actually Sends**
- Enhanced logging will show the exact payload structure
- This will help us understand if Vapi is sending `request-start` in a different format
- Or if Vapi is simply not sending it at all

---

## 🚀 Recommended Next Steps

### Immediate (High Priority):

1. **Fix end-of-call-report handling** ✅ (Already done)
   - Make sure it never returns errors
   - Always return success

2. **Add direct request-start response** (NEW)
   - Don't convert to system message
   - Respond immediately with greeting
   - This might "unlock" Vapi to continue using webhook

3. **Check Vapi Dashboard thoroughly**
   - Look for ANY setting related to "Server", "Webhook", "Events", "Messages"
   - Take screenshots of all settings pages
   - Check if settings persist after refresh

### Medium Priority:

4. **Try different firstMessageMode values**
   - Test with `firstMessageMode` removed
   - Test with minimal `firstMessage: " "`

5. **Contact Vapi Support**
   - Provide assistant ID and exact issue
   - Ask specifically: "Why isn't Server URL called for request-start events?"

### Long-term:

6. **Consider Alternatives**
   - Optimize Twilio with Media Streams (4-6 hours, same latency)
   - Try Retell AI (similar to Vapi, better docs)
   - Try Bland AI (reliable, low latency)

---

## 📊 Success Criteria

**What "working" looks like:**
1. ✅ Vapi calls webhook with `request-start` when call connects
2. ✅ Webhook responds with greeting
3. ✅ Vapi calls webhook with `user` message when user speaks
4. ✅ Webhook responds with agent's response
5. ✅ Conversation continues with webhook handling all messages
6. ✅ Vapi calls webhook with `end-of-call-report` when call ends

**Current state:**
- ❌ Step 1: Not happening
- ❌ Step 2: Can't happen (step 1 fails)
- ❌ Step 3: Not happening
- ❌ Step 4: Can't happen (step 3 fails)
- ❌ Step 5: Not happening
- ✅ Step 6: Happening (but returns error)

---

## 🎯 Conclusion

**The core issue:** Vapi is not configured to use the Server URL for real-time events, despite our API configuration being correct. This is likely a Vapi-side issue (missing dashboard setting, bug, or behavior change).

**Our code is fine:** The webhook handles what it receives correctly. The problem is Vapi isn't sending the events we need.

**Best path forward:**
1. Try direct `request-start` response (might unlock Vapi)
2. Thoroughly check Vapi dashboard for hidden settings
3. Contact Vapi support with specific details
4. If still not working, optimize Twilio (proven, reliable, same latency)

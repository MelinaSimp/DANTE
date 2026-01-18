# Vapi Webhook Troubleshooting Checklist

## 🔍 Current Issue
Vapi is only sending `end-of-call-report` messages, NOT calling the webhook during the call. This means the assistant isn't using your webhook for responses.

## ✅ Configuration Checklist

### 1. **Assistant Configuration** (CRITICAL)
Go to Vapi Dashboard → Assistants → Your Assistant → Check:

- [ ] **Server URL** is set to: `https://drift-1et9oivry-drift4.vercel.app/api/vapi/webhook`
- [ ] **Model Messages** is EMPTY (no system prompts, no user/assistant messages)
- [ ] **First Message** is EMPTY
- [ ] **First Message Mode** is set to `"assistant-speaks-first"`

### 2. **Phone Number Configuration** (CRITICAL)
Go to Vapi Dashboard → Phone Numbers → Your Number → Check:

- [ ] **Server URL** is set to: `https://drift-1et9oivry-drift4.vercel.app/api/vapi/webhook`
- [ ] **Assistant** is linked to your assistant
- [ ] **SMS** is DISABLED (we use Twilio for SMS)

### 3. **Server Messages/Events** (CRITICAL - Often Missed!)
Go to Vapi Dashboard → Assistants → Your Assistant → Advanced/Server Settings:

- [ ] **Server Messages** or **Server Events** should include:
  - ✅ `request-start` (call initiation)
  - ✅ `user` (user messages)
  - ✅ `assistant` (assistant requests)
  - ✅ `function-call` (if using custom functions)
  - ✅ `status-update` (call status changes)
  - ✅ `end-of-call-report` (call summary)

**If you don't see these options**, Vapi might be using a different configuration method. Check:
- Look for "Server URL Events" or "Webhook Events" section
- Or check if there's a "Enable Server URL" toggle

### 4. **Model Configuration** (IMPORTANT)
In the Assistant settings, under Model:

- [ ] **Model** is set (e.g., `gpt-4o-mini`)
- [ ] **Messages** array is EMPTY: `[]`
- [ ] **System Prompt** is EMPTY or not set
- [ ] **Tools/Functions** - If you have custom tools, make sure they're configured correctly

### 5. **Test the Configuration**

After making changes:

1. **Make a test call** to your phone number
2. **Check Vercel logs** for `[Vapi]` entries:
   - You should see `[Vapi] Call started (request-start)` when call connects
   - You should see `[Vapi] User message received` when user speaks
   - You should see `[Vapi] Returning response` when assistant responds

3. **If you only see `end-of-call-report`**:
   - Vapi is NOT calling your webhook during the call
   - This means the Server URL isn't configured to receive real-time events
   - Go back to step 3 and enable Server Messages/Events

## 🐛 Common Issues

### Issue: "Missing call information" error
**Cause**: Webhook is receiving messages but can't extract call ID
**Fix**: The webhook handler should extract `call.id` from `body.call`. Check logs to see what structure Vapi is actually sending.

### Issue: Assistant doesn't respond
**Cause**: Vapi isn't calling the webhook, using its own model instead
**Fix**: 
1. Clear all model messages (set to `[]`)
2. Clear system prompt
3. Enable Server Messages/Events (step 3 above)

### Issue: Only receiving end-of-call-report
**Cause**: Server URL isn't configured to receive real-time events
**Fix**: Enable Server Messages/Events in assistant settings (step 3 above)

## 📝 Manual Configuration Steps

If the API script doesn't work, manually configure in Vapi Dashboard:

1. **Assistant → Model → Messages**: Delete all messages, leave empty `[]`
2. **Assistant → Server URL**: Set to your webhook URL
3. **Assistant → First Message**: Leave empty
4. **Assistant → Advanced → Server Messages**: Enable all events
5. **Phone Number → Server URL**: Set to same webhook URL
6. **Phone Number → Assistant**: Link to your assistant

## 🔗 Vapi Documentation
- [Vapi Server URL Documentation](https://docs.vapi.ai/server-url/overview)
- [Vapi Server Events](https://docs.vapi.ai/server-url/events)

# Voice Agent Debugging Guide

## How to See Voice Agent Errors

### 1. **Check Server Logs** (Best Method)
When you make a call, errors are logged to your server console with detailed information:

```
[Twilio Response] Agent execution failed: {
  conversationId: "...",
  callSid: "...",
  error: "Step not found: abc-123",
  stepId: "...",
  agentId: "...",
  ...
}
```

**Where to find:**
- If running `npm run dev` locally: Check the terminal where it's running
- If deployed on Vercel: Check Vercel Dashboard → Functions → Logs

### 2. **Check Conversation Transcript**
Errors are automatically stored in the conversation transcript with `role: "system"`:

1. Go to your app
2. Navigate to conversations/calls
3. Find the conversation from the failed call
4. Look for messages with `role: "system"` that contain "ERROR"

### 3. **Use Debug Endpoint** (Development Only)
You can view detailed conversation info including errors:

```
GET /api/debug/conversation/[conversationId]
```

**Example:**
```bash
curl http://localhost:3002/api/debug/conversation/YOUR_CONVERSATION_ID
```

This returns:
- Full conversation details
- Transcript with errors highlighted
- Current step information
- Gathered data
- Error messages

### 4. **Check Vercel Logs** (Production)
If deployed on Vercel:

1. Go to [vercel.com](https://vercel.com)
2. Select your project
3. Click **Functions** tab
4. Find `/api/twilio/response` function
5. Click to see logs

## Common Voice Agent Errors

### "Step not found"
- **Cause**: The conversation's `current_step_id` points to a step that doesn't exist
- **Fix**: Check if the step was deleted or the agent scenario changed

### "Agent ID is missing"
- **Cause**: Conversation doesn't have a valid `agent_id`
- **Fix**: Ensure the agent exists and is properly linked to the conversation

### "OPENAI_API_KEY not configured"
- **Cause**: Missing or invalid OpenAI API key
- **Fix**: Set `OPENAI_API_KEY` in your environment variables

### "Execution failed"
- **Cause**: Generic error during step execution
- **Fix**: Check the detailed error message in logs for specific cause

## Development vs Production

### Development Mode
- Errors are spoken to the caller (e.g., "Error occurred: Step not found")
- Detailed error logs in console
- Errors stored in conversation transcript

### Production Mode
- Generic error message spoken (e.g., "I'm sorry, I encountered an error")
- Errors still logged but not exposed to caller
- Errors still stored in conversation transcript

## Testing Voice Agent

1. **Make a test call** to your Twilio number
2. **Watch your server logs** in real-time
3. **Check the conversation** after the call ends
4. **Use debug endpoint** to see full details

## Quick Debug Checklist

- [ ] Is the agent deployed?
- [ ] Does the agent have a scenario with steps?
- [ ] Is the first step a "Say" step?
- [ ] Is OPENAI_API_KEY set?
- [ ] Check server logs for specific error
- [ ] Check conversation transcript for errors
- [ ] Verify step IDs exist in database


# How to Debug Your Voice Agent Error

Based on your Vercel dashboard, the function is running (3 invocations, 0% HTTP errors), but there's an application-level error. Here's how to find it:

## Step 1: Check Vercel Function Logs (Not Just Observability)

1. In Vercel Dashboard, go to **Logs** tab (not Observability)
2. Filter for `/api/twilio/response`
3. Look for entries with `[Twilio Response] Agent execution failed:`
4. You should see detailed error logs like:
   ```
   [Twilio Response] Agent execution failed: {
     conversationId: "...",
     error: "Step not found: abc-123",
     stepId: "...",
     agentId: "...",
     ...
   }
   ```

## Step 2: Get the Conversation ID

After a failed call:
1. Go to your Supabase dashboard
2. Navigate to `conversations` table
3. Find the most recent conversation (sort by `created_at` DESC)
4. Copy the `id` field

## Step 3: Use the Debug Endpoint

Visit this URL (replace `YOUR_CONVERSATION_ID`):
```
https://driftai.studio/api/debug/conversation/YOUR_CONVERSATION_ID
```

Or if testing locally:
```
http://localhost:3002/api/debug/conversation/YOUR_CONVERSATION_ID
```

This will show you:
- The exact error message
- Full conversation transcript
- Current step information
- All gathered data

## Step 4: Check Conversation Transcript in Database

1. Go to Supabase Dashboard
2. Open `conversations` table
3. Find your conversation
4. Look at the `transcript` column
5. Find entries with `role: "system"` - these contain the errors

## Step 5: Common Issues to Check

Based on the error, check:

### If error is "Step not found":
- Go to `steps` table in Supabase
- Check if the step ID in the error exists
- Verify the agent's scenario has valid steps

### If error is "Agent ID is missing":
- Check the `conversations` table
- Verify `agent_id` is set correctly
- Make sure the agent exists in `agents` table

### If error is "OPENAI_API_KEY not configured":
- Check Vercel Environment Variables
- Make sure `OPENAI_API_KEY` is set
- Redeploy if you just added it

## Quick Test

1. Make a test call to your Twilio number
2. Immediately check Vercel Logs tab
3. Look for the `[Twilio Response] Agent execution failed:` log
4. Copy the error message
5. Share it with me and I'll help fix it!


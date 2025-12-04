# Complete Agent Testing Guide

## 🎯 Overview

This guide walks you through testing your AI agents, both **chat** and **voice** modalities.

---

## ✅ Prerequisites Checklist

Before testing, make sure you have:

### Required:
- [ ] **Supabase Database** - All tables created (run `SETUP_DATABASE.sql` and `supabase-conversations-setup.sql`)
- [ ] **OpenAI API Key** - Set in `.env.local` and Vercel
- [ ] **User Account** - Signed up and logged in
- [ ] **Workspace** - Created automatically on signup

### For Chat Testing:
- [ ] ✅ Everything above (no additional requirements)

### For Voice Testing:
- [ ] **Twilio Account** - Sign up at [twilio.com](https://www.twilio.com)
- [ ] **Twilio Phone Number** - Purchase a number
- [ ] **Twilio Credentials** - Account SID and Auth Token
- [ ] **Environment Variables** - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- [ ] **Webhook URLs** - `PUBLIC_BASE_URL` and `APP_BASE_URL` set in Vercel

---

## 📋 Step-by-Step: Testing a Chat Agent

### Step 1: Create an Agent
1. Go to your app: `https://your-domain.vercel.app/app`
2. Sign in if not already
3. In the sidebar, click **"Add agent"** button
4. Fill in:
   - **Name**: "Test Chat Agent"
   - **Modality**: Select **"Chat"**
   - **Description**: (optional)
5. Click **"Create"**

### Step 2: Create a Scenario
1. Select your agent from the sidebar
2. Click **"Add scenario"** button
3. Name it: "Greeting Flow"
4. Click **"Create"**

### Step 3: Add Steps to Scenario
1. You should see the **Agent Canvas**
2. Drag and drop a **"Say"** step from the left panel
3. Click on the step to edit
4. Enter a message like: "Hello! I'm your AI assistant. How can I help you today?"
5. Save the step

### Step 4: Deploy the Agent
1. Click the **"Deploy agent"** button in the top right
2. Confirm deployment
3. Agent status should change to **"deployed"**

### Step 5: Test the Chat Interface
1. Click the **"Test Results"** tab
2. You should see the chat interface
3. Type a message: "Hello"
4. Press Enter or click Send
5. The agent should respond based on your scenario

### Step 6: Verify It's Working
✅ **Success indicators:**
- Chat interface loads
- You can type and send messages
- Agent responds with your configured message
- Messages appear in the chat history

❌ **If it doesn't work:**
- Check browser console for errors
- Verify `OPENAI_API_KEY` is set
- Check Vercel logs: `vercel logs`
- Ensure agent is "deployed" status

---

## 📞 Step-by-Step: Testing a Voice Agent

### Step 1: Set Up Twilio Account
1. Sign up at [twilio.com](https://www.twilio.com/try-twilio)
2. Get your **Account SID** and **Auth Token** from the dashboard
3. Purchase a phone number:
   - Go to **Phone Numbers** → **Buy a Number**
   - Choose a number with voice capabilities
   - Complete purchase

### Step 2: Configure Environment Variables
Add to `.env.local`:
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890  # Your Twilio number
PUBLIC_BASE_URL=https://your-domain.vercel.app
APP_BASE_URL=https://your-domain.vercel.app
```

**Add to Vercel:**
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add all the variables above
3. **Redeploy** your app

### Step 3: Create a Voice Agent
1. In your app, click **"Add agent"**
2. Fill in:
   - **Name**: "Test Voice Agent"
   - **Modality**: Select **"Voice"**
3. Click **"Create"**

### Step 4: Add Phone Number
1. Select your voice agent
2. Go to **"Advanced"** tab in sidebar
3. Scroll to **"Phone Number Setup"**
4. Enter your Twilio phone number: `+1234567890`
5. Click **"Save All Changes"**

### Step 5: Create a Scenario
1. Go to **"Scenarios"** in sidebar
2. Click **"Add scenario"**
3. Name it: "Call Handling"
4. Click **"Create"**

### Step 6: Add Steps
1. In Agent Canvas, add a **"Say"** step
2. Edit it: "Hello! Thank you for calling. How can I assist you today?"
3. Add a **"Gather"** step after it
4. Configure the gather step to collect user input

### Step 7: Deploy the Agent
1. Click **"Deploy agent"** button
2. Confirm deployment
3. Status should be **"deployed"**

### Step 8: Configure Twilio Webhooks
1. Go to [Twilio Console](https://console.twilio.com)
2. Navigate to **Phone Numbers** → **Manage** → **Active Numbers**
3. Click on your phone number
4. Scroll to **Voice & Fax** section
5. Set **"A CALL COMES IN"**:
   - **Webhook**: `https://your-domain.vercel.app/api/twilio/incoming`
   - **HTTP**: POST
6. Set **"STATUS CALLBACK URL"**:
   - **URL**: `https://your-domain.vercel.app/api/twilio/status`
   - **HTTP**: POST
7. Click **"Save"**

### Step 9: Test the Voice Agent
1. Call your Twilio phone number from your regular phone
2. You should hear the AI greeting
3. Speak your response
4. The AI should respond based on your scenario

### Step 10: Verify It's Working
✅ **Success indicators:**
- Call connects successfully
- You hear the AI greeting
- AI responds to your speech
- Call transcript appears in **"Evaluation"** tab after call ends

❌ **If it doesn't work:**
- Check Twilio webhook logs in Twilio Console
- Verify webhook URLs are correct
- Check Vercel logs: `vercel logs`
- Ensure agent status is "deployed"
- Verify phone number is set in Advanced settings

---

## 🔍 Troubleshooting

### Chat Agent Not Responding

**Check:**
1. **OpenAI API Key**:
   ```bash
   # Test OpenAI connection
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer $OPENAI_API_KEY"
   ```

2. **Agent Status**: Must be "deployed"
3. **Scenario Exists**: Agent needs at least one scenario
4. **Steps Exist**: Scenario needs at least one step
5. **Browser Console**: Check for JavaScript errors
6. **Vercel Logs**: `vercel logs --follow`

### Voice Agent Not Working

**Check:**
1. **Twilio Credentials**: Verify in Twilio Console
2. **Webhook URLs**: Must be publicly accessible (not localhost)
3. **Phone Number**: Must match the number in Advanced settings
4. **Agent Status**: Must be "deployed"
5. **Twilio Webhook Logs**: Check in Twilio Console → Monitor → Logs
6. **Vercel Logs**: `vercel logs --follow`

### Common Errors

**"Agent not found"**
- Agent status must be "deployed"
- Phone number must match exactly

**"OPENAI_API_KEY not found"**
- Add to `.env.local` and Vercel
- Redeploy after adding

**"Webhook timeout"**
- Check Vercel function timeout (should be < 10s for free tier)
- Optimize agent execution

**"No response from AI"**
- Check OpenAI API key is valid
- Verify you have OpenAI credits
- Check Vercel logs for errors

---

## 📊 Testing Checklist

### Chat Agent:
- [ ] Agent created
- [ ] Scenario created
- [ ] Steps added
- [ ] Agent deployed
- [ ] Chat interface loads
- [ ] Can send messages
- [ ] Agent responds correctly
- [ ] Messages persist

### Voice Agent:
- [ ] Twilio account set up
- [ ] Phone number purchased
- [ ] Environment variables set
- [ ] Agent created (voice modality)
- [ ] Phone number added in Advanced
- [ ] Scenario created
- [ ] Steps added
- [ ] Agent deployed
- [ ] Twilio webhooks configured
- [ ] Can make calls
- [ ] AI responds to speech
- [ ] Call transcript appears

---

## 🚀 Quick Test Commands

### Test OpenAI Connection:
```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### Test Twilio Connection:
```bash
curl -X GET "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID.json" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN"
```

### Check Vercel Logs:
```bash
vercel logs --follow
```

### Test Webhook Endpoint:
```bash
curl -X POST https://your-domain.vercel.app/api/twilio/incoming \
  -d "CallSid=test123&From=+1234567890&To=+0987654321&CallStatus=ringing"
```

---

## 📝 Next Steps After Testing

Once your agent is working:

1. **Add More Scenarios** - Create different conversation flows
2. **Add Branches** - Use "If" steps for conditional logic
3. **Add Policies** - Upload company policies for context
4. **Add Data Sources** - Upload knowledge base documents
5. **Customize Personalization** - Set voice model and personality
6. **Review Call Transcripts** - Check Evaluation tab for voice calls
7. **Optimize Responses** - Refine step messages based on testing

---

## 🆘 Need Help?

If you encounter issues:
1. Check the troubleshooting section above
2. Review Vercel logs: `vercel logs --follow`
3. Check Twilio webhook logs in Twilio Console
4. Verify all environment variables are set
5. Ensure database tables are created
6. Check browser console for frontend errors

---

## ✅ Success Criteria

Your agent is working correctly when:

**Chat:**
- ✅ Messages send and receive
- ✅ Agent responds based on scenarios
- ✅ Conversation history persists
- ✅ Multiple messages work in sequence

**Voice:**
- ✅ Calls connect successfully
- ✅ AI greets caller
- ✅ AI understands speech input
- ✅ AI responds appropriately
- ✅ Call transcript is saved
- ✅ Call appears in Evaluation tab

---

**Ready to test? Start with Step 1 above!** 🚀












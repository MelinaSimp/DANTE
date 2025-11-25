# Voice Receptionist Setup Guide

## 🎯 Yes, This is for Voice Calls!

The scenario flow (Say greeting → Gather question → Q&A with knowledge base) works for **voice calls via Twilio**.

---

## 📞 Voice-Specific Setup

### 1. Agent Configuration

1. Go to your agent builder (`/gigaai`)
2. Create or select your agent
3. **Set Modality**: Make sure the agent is set to **"voice"** (or "multi-modal" if you want both voice and chat)
4. Go to **"Advanced"** tab
5. **Add Phone Number**: Enter your Twilio phone number (format: `+1234567890`)
   - This is the number customers will call
   - Must match the number in your Twilio account

### 2. Create the Scenario (Same as Before)

**Step 1: Say (Greeting)**
- Drag "Say" onto canvas
- Click to edit
- Message: `Hello! Thank you for calling [Your Company]. How can I help you today?`
- This will be **spoken** when someone calls

**Step 2: Gather (Question)**
- Drag "Gather" onto canvas (after Say step)
- Click to edit
- Name: `inquiry`
- Message: `What would you like help with today?`
- This will be **spoken** to the caller

### 3. Add Knowledge Base

**Policies Tab:**
- Add company policies/guidelines

**Data Sources Tab:**
- Add information the receptionist can use to answer questions
- Examples: services, hours, pricing, contact info

### 4. Configure Twilio Webhooks

**In Twilio Console:**

1. Go to: **Phone Numbers** → **Manage** → **Active Numbers**
2. Click on your phone number
3. Under **"Voice & Fax"** section:
   - **A CALL COMES IN**: 
     ```
     https://driftai.studio/api/twilio/incoming
     ```
   - **STATUS CALLBACK URL**:
     ```
     https://driftai.studio/api/twilio/status
     ```
4. Set **HTTP Method** to: `POST`
5. Save

**Important:** Your production domain is: `https://driftai.studio`

### 5. Deploy the Agent

1. Click **"Deploy Agent"** in the Advanced tab
2. Make sure the agent status shows as **"deployed"**

---

## 🧪 Testing Voice Calls

### Test the Flow:

1. **Call your Twilio phone number** from any phone
2. You should hear:
   - ✅ **Greeting** (Step 1 - Say): "Hello! Thank you for calling..."
   - ✅ **Question** (Step 2 - Gather): "What would you like help with today?"
3. **Speak your question** (e.g., "What are your business hours?")
4. **Receptionist responds** using your Policies and Data Sources
5. **Receptionist asks**: "Is there anything else I can help with?"
6. **Ask more questions** to test Q&A mode
7. **Say "no thanks"** or "that's all" to end the call

---

## 🔊 How Voice Works

### When Someone Calls:

1. **Call comes in** → Twilio sends webhook to `/api/twilio/incoming`
2. **System looks up agent** by phone number
3. **Creates conversation** record
4. **Loads first scenario** and step
5. **Generates TwiML** with greeting
6. **Twilio speaks** the greeting to caller
7. **Twilio listens** for caller's response (Gather)
8. **Caller speaks** their question
9. **Twilio sends** speech-to-text to `/api/twilio/response`
10. **System executes** agent step using knowledge base
11. **System generates** answer using Policies/Data Sources
12. **Twilio speaks** the answer
13. **Continues** in Q&A mode until caller is satisfied

---

## ✅ Voice-Specific Checklist

- [ ] Agent modality set to **"voice"** (or "multi-modal")
- [ ] Phone number added in **Advanced settings**
- [ ] Phone number format: `+1234567890` (with country code)
- [ ] Twilio webhooks configured:
  - [ ] Incoming: `https://driftai.studio/api/twilio/incoming`
  - [ ] Status: `https://driftai.studio/api/twilio/status`
- [ ] Scenario has 2 steps: Say (greeting) + Gather (question)
- [ ] Gather step name is `inquiry`
- [ ] At least 1 Policy added
- [ ] At least 1 Data Source added
- [ ] Agent is **deployed**

---

## 🐛 Voice-Specific Troubleshooting

### Issue: "This number is not configured for the receptionist"
- **Check**: Phone number in Advanced settings matches Twilio number exactly
- **Check**: Phone number format is correct (`+1234567890`)
- **Fix**: Make sure the number in the database matches what Twilio sends

### Issue: No greeting heard
- **Check**: Say step has message in `ai_message` field
- **Check**: Agent is deployed
- **Fix**: Edit Say step and add greeting message

### Issue: Can't hear responses
- **Check**: Twilio webhooks are configured correctly
- **Check**: Your domain is accessible (not localhost)
- **Check**: Twilio account has credits
- **Fix**: Verify webhook URLs in Twilio console

### Issue: Speech not being recognized
- **Check**: Twilio has speech recognition enabled (it's automatic with `<Gather>`)
- **Check**: You're speaking clearly
- **Check**: Language is set to English (US) in TwiML

---

## 📝 Example Voice Flow

**Caller calls:** `+1 (555) 123-4567`

**Receptionist (Step 1 - Say):**
> "Hello! Thank you for calling ABC Plumbing Services. How can I help you today?"

**Receptionist (Step 2 - Gather):**
> "What would you like help with today?"

**Caller speaks:**
> "What are your business hours?"

**Receptionist (using Data Sources):**
> "We're open Monday through Friday from 8am to 6pm, and Saturday from 9am to 3pm. Is there anything else I can help you with?"

**Caller speaks:**
> "Do you offer emergency services?"

**Receptionist (using Data Sources):**
> "Yes, we offer 24/7 emergency plumbing services. There's a $50 emergency surcharge. Is there anything else I can help you with?"

**Caller speaks:**
> "No, that's all. Thank you!"

**Receptionist:**
> "Thank you for calling! Have a great day!"

**Call ends.**

---

## 🎉 You're Ready!

Once you've:
1. ✅ Set agent to "voice" modality
2. ✅ Added phone number
3. ✅ Configured Twilio webhooks
4. ✅ Created scenario (Say + Gather)
5. ✅ Added Policies and Data Sources
6. ✅ Deployed agent

**Your voice receptionist is ready to answer calls using your knowledge base!**

The same scenario works for both voice and chat - just make sure the agent modality includes "voice" for phone calls.


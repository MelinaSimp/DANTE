# Quick Test Guide - Receptionist Q&A

## 🚀 Quick Setup (5 minutes)

### 1. Create Scenario with 2 Steps

**Step 1: Say (Greeting)**
- Drag "Say" onto canvas
- Click to edit
- Message: `Hello! Thank you for calling. How can I help you today?`

**Step 2: Gather (Question)**
- Drag "Gather" onto canvas (after Say step)
- Click to edit
- Name: `inquiry`
- Message: `What would you like help with today?`

### 2. Add Knowledge Base

**Policies Tab:**
- Add: "Always be professional and helpful"
- Add: "If you don't know, offer to connect them with someone who can help"

**Data Sources Tab:**
- Add: Name: "Services", Content: "We offer plumbing, electrical, and HVAC services"
- Add: Name: "Hours", Content: "We're open Monday-Friday 9am-5pm"

### 3. Deploy & Test

1. Click "Deploy Agent"
2. Go to "Test Results" tab
3. Start chatting!

---

## ✅ What Should Happen

1. **Greeting appears** → "Hello! Thank you for calling..."
2. **Question asked** → "What would you like help with today?"
3. **You type**: "What are your business hours?"
4. **Receptionist answers** using your Data Sources → "We're open Monday-Friday 9am-5pm"
5. **Receptionist asks**: "Is there anything else I can help with?"
6. **You can ask more questions** → Each answered using knowledge base
7. **Say "no thanks"** → Conversation ends

---

## 🐛 Quick Fixes

**No greeting?** → Edit Say step, add message to `ai_message` field

**Not answering questions?** → Make sure Gather step name is `inquiry`

**Answers not using knowledge?** → Add at least 1 Policy and 1 Data Source

**Not continuing Q&A?** → Don't add more steps after Gather - system handles it automatically

---

## 📞 Voice Testing

1. Set phone number in Advanced settings
2. Configure Twilio webhooks:
   - Incoming: `https://driftai.studio/api/twilio/incoming`
   - Status: `https://driftai.studio/api/twilio/status`
3. Call the number
4. Same flow as chat, but with voice!

---

**That's it!** Your receptionist is ready to answer questions using your knowledge base.


# Scenario Flow Guide - Receptionist Q&A Setup

## 📋 Overview

This guide shows you how to set up a simple receptionist flow that:
1. Shows a greeting
2. Asks a general question
3. Uses your Policies and Data Sources as a knowledge base to answer any customer question

---

## 🎯 Scenario Flow Structure

Your scenario should have **exactly 2 steps** in this order:

### Step 1: Say (Greeting)
- **Type**: Say
- **Message**: Your greeting message
- **Example**: "Hello! Thank you for calling [Your Company Name]. How can I help you today?"

### Step 2: Gather (Question)
- **Type**: Gather
- **Name/Variable**: `inquiry` or `question` (this helps the system detect it's asking for a question)
- **Message**: The question you want to ask
- **Example**: "What would you like help with today?" or "How can I assist you?"

**That's it!** After these 2 steps, the system automatically:
- Detects the customer's question
- Uses your Policies and Data Sources to generate an answer
- Enters Q&A mode for follow-up questions
- Continues until the customer is satisfied

---

## 🛠️ Step-by-Step Setup

### 1. Create or Select an Agent

1. Go to `/gigaai` (or your agent builder page)
2. Create a new agent or select an existing one
3. Make sure the agent is set to **"voice"** or **"chat"** modality (or both)

### 2. Create a Scenario

1. Click **"Create Scenario"** or select an existing scenario
2. Name it something like: **"Main Receptionist Flow"** or **"Customer Q&A"**
3. Click to open the scenario canvas

### 3. Add Step 1: Say (Greeting)

1. In the function palette on the left, find **"Say"**
2. **Drag and drop** it onto the canvas
3. **Click on the step** to edit it
4. Enter your greeting message in the `ai_message` field, for example:
   ```
   Hello! Thank you for calling [Your Company Name]. How can I help you today?
   ```
5. Save the step

### 4. Add Step 2: Gather (Question)

1. In the function palette, find **"Gather"**
2. **Drag and drop** it onto the canvas (it should appear after the Say step)
3. **Click on the step** to edit it
4. Set the **Name/Variable** to: `inquiry` (this helps the system detect it's a question)
5. Enter your question in the `ai_message` field, for example:
   ```
   What would you like help with today?
   ```
   OR
   ```
   How can I assist you?
   ```
6. Save the step

### 5. Add Policies (Knowledge Base)

1. Go to the **"Policies"** tab in your agent builder
2. Click **"Add Policy"** or **"Create Policy"**
3. Add policies that the receptionist should follow, for example:
   - "Always be polite and professional"
   - "If you don't know the answer, offer to connect them with someone who can help"
   - "Our business hours are Monday-Friday 9am-5pm"
   - "We accept returns within 30 days of purchase"
4. Add as many policies as needed

### 6. Add Data Sources (Knowledge Base)

1. Go to the **"Data Sources"** tab in your agent builder
2. Click **"Add Data Source"** or **"Create Data Source"**
3. Add information the receptionist can use to answer questions, for example:
   - **Name**: "Company Services"
     **Content**: "We offer plumbing, electrical, and HVAC services. Plumbing services include leak repairs, drain cleaning, and installation. Electrical services include wiring, panel upgrades, and lighting installation. HVAC services include AC repair, heating installation, and duct cleaning."
   
   - **Name**: "Pricing Information"
     **Content**: "Our service call fee is $75. Hourly rates: Plumbing $120/hour, Electrical $130/hour, HVAC $140/hour. Emergency calls have a $50 surcharge."
   
   - **Name**: "Contact Information"
     **Content**: "Our main office is located at 123 Main Street. Phone: (555) 123-4567. Email: info@company.com. We're open Monday-Friday 8am-6pm."
4. Add as many data sources as needed

### 7. Deploy the Agent

1. Go to the **"Advanced"** tab (if it's a voice agent, make sure you have a phone number configured)
2. Click **"Deploy Agent"**
3. Confirm the deployment

---

## 🧪 Testing Your Setup

### Option 1: Test with Chat (Easiest)

1. Make sure your agent has **"chat"** modality enabled
2. Go to the **"Test Results"** tab
3. You should see a chat interface
4. Start chatting:
   - The greeting should appear first
   - Then it will ask your question
   - Type a question like: "What are your business hours?"
   - The receptionist should answer using your Policies and Data Sources
   - Ask follow-up questions to test Q&A mode

### Option 2: Test with Voice Call

1. Make sure your agent has **"voice"** modality enabled
2. Make sure you have a phone number configured in Advanced settings
3. Make sure Twilio webhooks are configured:
   - In Twilio Console → Phone Numbers → Your Number
   - Set "A CALL COMES IN" to: `https://driftai.studio/api/twilio/incoming`
   - Set "STATUS CALLBACK URL" to: `https://driftai.studio/api/twilio/status`
4. Call the phone number
5. You should hear:
   - The greeting
   - Then the question
   - Speak your question
   - The receptionist will answer using your knowledge base
   - Continue asking questions to test Q&A mode

---

## ✅ Expected Behavior

### When a Call/Chat Starts:
1. ✅ Greeting is shown/spoken first
2. ✅ System asks the general question
3. ✅ Customer responds with their question

### When Customer Asks a Question:
1. ✅ System detects it's an inquiry/question
2. ✅ System loads Policies and Data Sources
3. ✅ System generates an answer using the knowledge base
4. ✅ System asks: "Is there anything else I can help with?"
5. ✅ System enters Q&A mode

### In Q&A Mode:
1. ✅ Customer can ask follow-up questions
2. ✅ Each question is answered using Policies and Data Sources
3. ✅ System maintains conversation context
4. ✅ System continues until customer is satisfied
5. ✅ When customer says they're done, conversation ends politely

---

## 🔍 Troubleshooting

### Issue: Greeting not showing
- **Check**: Make sure Step 1 (Say) has a message in the `ai_message` field
- **Fix**: Click on the Say step and add your greeting message

### Issue: System not detecting questions
- **Check**: Make sure Step 2 (Gather) has `inquiry` or `question` in the name/variable field
- **Check**: Make sure the Gather step message asks a question (contains "how", "what", "help", etc.)
- **Fix**: Edit the Gather step and set the name to `inquiry`

### Issue: Answers not using knowledge base
- **Check**: Make sure you've added Policies in the Policies tab
- **Check**: Make sure you've added Data Sources in the Data Sources tab
- **Check**: Make sure the agent is deployed
- **Fix**: Add at least one Policy and one Data Source, then redeploy

### Issue: Q&A mode not continuing
- **Check**: Make sure the Gather step stays on the same step (don't add more steps after it)
- **Fix**: The system should automatically stay in Q&A mode after the first question is answered

---

## 📝 Example Scenario Configuration

Here's a complete example:

### Scenario: "Main Receptionist Flow"

**Step 1: Say**
- Type: `say`
- Message: `Hello! Thank you for calling ABC Plumbing Services. How can I help you today?`

**Step 2: Gather**
- Type: `gather`
- Name: `inquiry`
- Message: `What would you like help with today?`

### Policies:
1. "Always be friendly and professional"
2. "If you don't know the answer, offer to connect them with a specialist"
3. "Our business hours are Monday-Friday 8am-6pm, Saturday 9am-3pm"

### Data Sources:
1. **Name**: "Services"
   **Content**: "We offer emergency plumbing, drain cleaning, water heater installation, and pipe repair. Emergency service available 24/7."

2. **Name**: "Pricing"
   **Content**: "Service call fee: $75. Hourly rate: $120/hour. Emergency surcharge: $50. Free estimates for installations."

3. **Name**: "Contact"
   **Content**: "Address: 123 Main St, City, State. Phone: (555) 123-4567. Email: info@abcplumbing.com"

---

## 🎉 You're Ready!

Once you've set up:
1. ✅ 2 steps (Say greeting + Gather question)
2. ✅ Policies added
3. ✅ Data Sources added
4. ✅ Agent deployed

Your receptionist will automatically use the knowledge base to answer any customer question!


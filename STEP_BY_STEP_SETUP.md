# Step-by-Step Setup Guide - What to Write in Each Step

## 📋 Overview

You only need **2 steps** in your scenario. Q&A mode is **automatic** - you don't create it, it happens automatically after Step 2.

---

## 🎯 Step 1: Say (Greeting)

### What This Does:
This is the **first thing the caller hears** when they call your number.

### What to Write:
Enter your greeting message in the **`ai_message`** field.

### Examples:

**Simple:**
```
Hello! Thank you for calling [Your Company Name]. How can I help you today?
```

**Professional:**
```
Good morning! Thank you for calling ABC Plumbing Services. This is our AI receptionist. How may I assist you today?
```

**Friendly:**
```
Hi there! Thanks for calling [Company Name]. I'm here to help. What can I do for you?
```

### How to Set It Up:
1. Drag "Say" step onto canvas
2. Click on the step to edit it
3. Find the **`ai_message`** field (or the message/text input)
4. Type your greeting
5. Save

**Important:** Make sure the message is in the `ai_message` field, not just the step name!

---

## 🎯 Step 2: Gather (Question)

### What This Does:
This asks the caller **what they need help with**. The system will listen to their response and use your knowledge base to answer.

### What to Write:
1. **Name/Variable field**: Set this to `inquiry` (this tells the system it's asking for a question)
2. **Message field (`ai_message`)**: Enter the question you want to ask

### Examples:

**Simple:**
- **Name/Variable**: `inquiry`
- **Message**: `What would you like help with today?`

**Direct:**
- **Name/Variable**: `inquiry`
- **Message**: `How can I assist you?`

**Detailed:**
- **Name/Variable**: `inquiry`
- **Message**: `What can I help you with today? Do you have a question about our services, pricing, or scheduling?`

### How to Set It Up:
1. Drag "Gather" step onto canvas (after the Say step)
2. Click on the step to edit it
3. Set the **Name** or **Variable** field to: `inquiry`
4. In the **`ai_message`** field, type your question
5. Save

**Important:** 
- The Name/Variable **must** be `inquiry` (or contain "inquiry", "question", "help") so the system knows it's asking for a question
- The message should be a question that prompts the caller to tell you what they need

---

## ❓ Where is Q&A Mode?

### Q&A Mode is AUTOMATIC - You Don't Create It!

**Q&A mode is not a step you create.** It happens automatically after Step 2 (Gather) when:

1. The caller responds to your question
2. The system detects they asked a question (because Step 2's name is `inquiry`)
3. The system automatically:
   - Uses your **Policies** and **Data Sources** to generate an answer
   - Speaks the answer to the caller
   - Asks "Is there anything else I can help with?"
   - **Stays on the same step** to wait for the next question
   - Repeats this process for each follow-up question

### How It Works:

```
Caller calls → Step 1 (Say) → Step 2 (Gather) → Caller speaks question
                                                      ↓
                                    System detects it's a question
                                                      ↓
                                    System uses Policies/Data Sources
                                                      ↓
                                    System answers the question
                                                      ↓
                                    System asks "Anything else?"
                                                      ↓
                                    [Q&A MODE - Loops here automatically]
                                                      ↓
                                    Caller asks another question → Answer → Loop
                                                      ↓
                                    Caller says "no thanks" → End call
```

### You Don't Need to:
- ❌ Create a "Q&A" step
- ❌ Create a loop step
- ❌ Add more steps after Gather
- ❌ Configure anything special

### You Just Need to:
- ✅ Create Step 1 (Say) with greeting
- ✅ Create Step 2 (Gather) with name=`inquiry` and a question
- ✅ Add Policies and Data Sources (the knowledge base)
- ✅ Deploy the agent

The system handles Q&A mode automatically!

---

## 📝 Complete Example Setup

### Scenario: "Main Receptionist Flow"

**Step 1: Say**
- **Type**: `say`
- **Name**: `Greeting` (optional, just for your reference)
- **Message (`ai_message`)**: 
  ```
  Hello! Thank you for calling ABC Plumbing Services. How can I help you today?
  ```

**Step 2: Gather**
- **Type**: `gather`
- **Name/Variable**: `inquiry` ⚠️ **IMPORTANT: Must be "inquiry"**
- **Message (`ai_message`)**: 
  ```
  What would you like help with today?
  ```

**That's it!** No more steps needed.

### What Happens Next (Automatic):

1. **Caller calls** → Hears Step 1 greeting
2. **System asks** Step 2 question
3. **Caller says**: "What are your business hours?"
4. **System automatically**:
   - Detects it's a question (because Step 2 name is `inquiry`)
   - Looks up answer in Data Sources
   - Answers: "We're open Monday-Friday 8am-6pm. Is there anything else I can help with?"
5. **Caller says**: "Do you offer emergency services?"
6. **System automatically**:
   - Uses Data Sources again
   - Answers: "Yes, we offer 24/7 emergency services. Is there anything else I can help with?"
7. **Caller says**: "No, that's all. Thanks!"
8. **System**: "Thank you for calling! Have a great day!" → Call ends

---

## 🎯 Key Points

1. **Step 1 (Say)**: Write your greeting message
2. **Step 2 (Gather)**: 
   - Name = `inquiry` (critical!)
   - Message = Your question
3. **Q&A Mode**: Automatic - no setup needed!
4. **Knowledge Base**: Add Policies and Data Sources so the system can answer questions

---

## ✅ Checklist

- [ ] Step 1 (Say) created with greeting message
- [ ] Step 2 (Gather) created with:
  - [ ] Name/Variable = `inquiry`
  - [ ] Message = Question to ask caller
- [ ] At least 1 Policy added (in Policies tab)
- [ ] At least 1 Data Source added (in Data Sources tab)
- [ ] Agent deployed

That's all you need! Q&A mode will work automatically.


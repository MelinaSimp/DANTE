# Call Flow Documentation

## Overview
This document explains how phone calls flow through the Drift AI agent system, from the initial call to completion.

## Call Flow Sequence

### 1. **Incoming Call** → `/api/twilio/incoming`
**When:** Customer calls your Twilio phone number

**What happens:**
- Twilio sends webhook to `/api/twilio/incoming`
- System finds the agent associated with the phone number
- Creates a new conversation record in database
- Gets the first step from the agent's scenario
- Executes the first step (usually a SAY step for greeting)
- Returns TwiML to Twilio

**Example TwiML Response:**
```xml
<Response>
  <Say voice="alice">Welcome! How can I help you today?</Say>
  <Redirect>https://driftai.studio/api/twilio/continue?conversationId=xxx&stepId=yyy</Redirect>
</Response>
```

---

### 2. **Continue to Next Step** → `/api/twilio/continue`
**When:** After SAY step completes, or when redirecting to next step

**What happens:**
- Gets the current step from conversation state
- Executes the step based on its type:
  - **SAY**: Speaks message, then continues to next step
  - **GATHER**: Prompts customer and waits for input
  - **Q/A**: Searches data sources and answers question
  - **CODE**: Executes custom code
  - **CONDITION**: Evaluates conditions and branches
- Updates conversation state with next step ID
- Returns TwiML response

**Example for SAY step:**
```xml
<Response>
  <Say voice="alice">Thank you for that information.</Say>
  <Redirect>https://driftai.studio/api/twilio/continue?conversationId=xxx&stepId=zzz</Redirect>
</Response>
```

**Example for GATHER step:**
```xml
<Response>
  <Say voice="alice">Please tell me your name.</Say>
  <Gather input="speech" action="https://driftai.studio/api/twilio/gather?conversationId=xxx&stepId=yyy" method="POST" speechTimeout="auto">
  </Gather>
</Response>
```

---

### 3. **Customer Input (GATHER)** → `/api/twilio/gather`
**When:** Customer speaks after a GATHER step

**What happens:**
- Receives customer's speech input from Twilio
- Stores input in conversation's `gathered_data` and `conversation_state`
- Evaluates step branches to find matching condition
- Determines next step (either from branch or next step by sort_order)
- Updates conversation with next step ID
- Redirects to `/api/twilio/continue` to execute next step

**Example:**
- Customer says: "My name is John"
- System stores: `{ lastInput: "My name is John", step_yyy: "My name is John" }`
- If branch condition matches "customer provides name", goes to that branch's next step
- Otherwise, goes to next step in sequence

---

### 4. **Q/A Step Execution** (within `/api/twilio/continue`)
**When:** Conversation reaches a Q/A step

**What happens:**
- Gets the query (from previous GATHER input or custom query)
- Calls `/api/qa/answer` with:
  - Query text
  - Agent ID
  - Data source IDs (or all if not specified)
- Searches data sources using RAG (Retrieval Augmented Generation)
- If answer found:
  - Speaks the answer
  - Continues to next step (or branch for "answer_found")
- If no answer found:
  - Speaks fallback message
  - Continues to next step (or branch for "no_answer")

**Example Flow:**
```
GATHER: "What are your business hours?"
  ↓
Q/A Step:
  - Query: "What are your business hours?"
  - Searches all data sources
  - Finds answer: "We're open Monday-Friday 9am-5pm"
  - Speaks answer
  - Continues to next step
```

---

### 5. **Branching Logic**
**When:** Step has branches defined

**What happens:**
- System evaluates branches in order
- Checks if customer input matches branch condition
- Checks if condition tags match gathered data
- Routes to branch's `next_step_id` or `next_scenario_id`
- If no branch matches, continues to next step by sort_order

**Example Branch:**
```
Step: GATHER (collect customer info)
Branches:
  - Condition: "Customer provides info"
    Tag: "@info_confirmed"
    Next Step: Identity Verification
  - Condition: "Customer refuses"
    Tag: "@info_not_provided"
    Next Step: Escalation
```

---

### 6. **Conversation End**
**When:** No more steps, or explicit hangup

**What happens:**
- Updates conversation status to "completed"
- Returns TwiML with goodbye message and hangup
- Conversation record remains in database for analytics

**Example:**
```xml
<Response>
  <Say voice="alice">Thank you for calling. Goodbye.</Say>
  <Hangup/>
</Response>
```

---

## Complete Example Flow

### Scenario: "New Account Onboarding"

1. **Call comes in**
   - Twilio → `/api/twilio/incoming`
   - Creates conversation
   - Executes first SAY step: "Welcome to Acme Bank! We're excited to get you started."

2. **GATHER step**
   - SAY: "May I confirm your full name and date of birth to begin?"
   - GATHER: Waits for customer input
   - Customer: "My name is John Smith, born January 1st, 1990"

3. **GATHER handler**
   - `/api/twilio/gather` receives input
   - Stores: `{ lastInput: "My name is John Smith...", step_xxx: "..." }`
   - Branch matches: "@info_confirmed"
   - Routes to Identity Verification step

4. **Identity Verification (SAY)**
   - `/api/twilio/continue` executes SAY step
   - "Thank you. Please upload a photo of your government-issued ID."
   - Continues to next step

5. **Q/A step** (if customer asks question)
   - Customer: "What documents do you accept?"
   - Q/A step searches data sources
   - Finds answer: "We accept passport, driver's license, and state ID."
   - Speaks answer
   - Continues flow

6. **Conversation continues**
   - Steps execute in sequence
   - Branches route based on conditions
   - Flow continues until completion

---

## Twilio Webhook URLs

### Production URLs (use these in Twilio Console):

**Incoming Call Webhook:**
```
https://driftai.studio/api/twilio/incoming
```

**Status Callback (optional):**
```
https://driftai.studio/api/twilio/status
```

### Vercel Deployment URLs (if custom domain not working):

**Incoming Call Webhook:**
```
https://[your-vercel-deployment].vercel.app/api/twilio/incoming
```

**Status Callback:**
```
https://[your-vercel-deployment].vercel.app/api/twilio/status
```

---

## How to Configure in Twilio

1. **Go to Twilio Console** → Phone Numbers → Manage → Active Numbers
2. **Click your phone number**
3. **In "Voice & Fax" section:**
   - **A CALL COMES IN**: Set to `https://driftai.studio/api/twilio/incoming`
   - **STATUS CALLBACK URL**: Set to `https://driftai.studio/api/twilio/status` (optional)
4. **HTTP Method**: POST
5. **Save**

---

## Internal API Endpoints (used by system, not Twilio)

- `/api/twilio/continue` - Continues conversation to next step
- `/api/twilio/gather` - Handles customer input from GATHER steps
- `/api/qa/answer` - Answers questions using data sources (called internally)

---

## Conversation State

Each conversation tracks:
- `current_step_id` - Which step is currently executing
- `current_scenario_id` - Which scenario is active
- `gathered_data` - All data collected from GATHER steps
- `conversation_state` - State variables (like lastGatherInput)
- `status` - active, completed, failed, transferred

---

## Error Handling

- **Missing step**: Uses fallback message, ends conversation
- **Q/A no answer**: Uses fallback message, continues to next step
- **No data sources**: Returns "No data sources available"
- **Invalid step type**: Logs error, uses fallback message

---

## Testing

1. **Create an agent** in the UI
2. **Add a scenario** with steps:
   - SAY: "Hello! How can I help you?"
   - GATHER: "Please tell me your name"
   - SAY: "Thank you, [name]!"
3. **Deploy the agent** (set status to "deployed")
4. **Call your Twilio number**
5. **Check conversation logs** in database

---

## Troubleshooting

**Call doesn't work:**
- Check Twilio webhook URL is correct
- Verify agent status is "deployed"
- Check agent has phone number configured
- Verify scenario has at least one step

**Steps not executing:**
- Check conversation record in database
- Verify `current_step_id` is set
- Check step exists and has correct type
- Review server logs for errors

**Q/A not working:**
- Verify data sources are added to agent
- Check Q/A step has query or previous GATHER input
- Review `/api/qa/answer` logs
- Verify OpenAI API key is set






# Vapi AI Migration Plan - Hybrid Approach (Voice via Vapi, SMS via Twilio)

## 📋 Overview

This migration replaces Twilio voice infrastructure with Vapi AI for voice calls while keeping Twilio for SMS functionality. This hybrid approach gives us:
- **Voice**: Low-latency Vapi infrastructure with ElevenLabs voices
- **SMS**: Existing Twilio SMS functionality (unchanged)

---

## 🔍 DETAILED EXPLANATION: What's Being Changed

### 1. **Voice Call Flow - Complete Replacement**

#### Current Flow (Twilio):
```
Customer calls → Twilio receives call
    ↓
Twilio webhook → /api/twilio/incoming
    ↓
Create conversation in database
    ↓
Generate greeting TwiML (with ElevenLabs audio if configured)
    ↓
Return TwiML to Twilio
    ↓
Twilio plays greeting, waits for user speech
    ↓
User speaks → Twilio webhook → /api/twilio/response
    ↓
Execute AgentExecutor (process user input)
    ↓
Generate response TwiML (with ElevenLabs audio)
    ↓
Return TwiML to Twilio
    ↓
Twilio plays response, waits for next input
    ↓
(Repeat until conversation ends)
```

#### New Flow (Vapi):
```
Customer calls → Vapi receives call
    ↓
Vapi webhook → /api/vapi/webhook
    ↓
Create conversation in database
    ↓
Execute AgentExecutor (process user input)
    ↓
Return JSON response with text + voice config
    ↓
Vapi sends text to ElevenLabs (using your API key)
    ↓
Vapi streams audio back to caller (low latency)
    ↓
(Repeat until conversation ends)
```

**Key Differences:**
- **No TwiML**: Vapi uses JSON, not XML TwiML
- **No audio URL generation**: Vapi handles ElevenLabs directly
- **No Gather tags**: Vapi handles speech-to-text automatically
- **Simpler flow**: One webhook endpoint instead of three

---

### 2. **Files Being Modified**

#### **A. New Files (Created)**
1. **`app/api/vapi/webhook/route.ts`** - New Vapi webhook handler
   - Replaces `/api/twilio/incoming` and `/api/twilio/response`
   - Handles both call start and ongoing conversation
   - Returns JSON instead of TwiML

2. **`lib/vapi/response.ts`** - Vapi response formatter
   - Formats agent responses for Vapi's expected JSON format
   - Handles conversation state management
   - Maps our conversation model to Vapi's format

3. **`docs/VAPI_SETUP.md`** - Setup documentation
   - Instructions for configuring Vapi
   - How to import Twilio numbers
   - How to configure ElevenLabs voices

#### **B. Modified Files**
1. **`app/api/twilio/incoming/route.ts`** - **DEPRECATED** (kept for reference, not used)
   - Marked as deprecated
   - Add comments explaining migration to Vapi

2. **`app/api/twilio/response/route.ts`** - **DEPRECATED** (kept for reference, not used)
   - Marked as deprecated
   - Add comments explaining migration to Vapi

3. **`app/api/twilio/continue/route.ts`** - **DEPRECATED** (kept for reference, not used)
   - Marked as deprecated
   - Vapi handles continuation automatically

4. **`app/api/twilio/sms/route.ts`** - **UNCHANGED**
   - SMS functionality remains exactly the same
   - Still uses Twilio for SMS delivery

5. **`lib/agent-executor/executor.ts`** - **UNCHANGED**
   - Core agent logic stays the same
   - No modifications needed
   - Works for both voice (Vapi) and SMS (Twilio)

#### **C. Unchanged Files (SMS Only)**
- `app/api/appointments/route.ts` - SMS reminders (unchanged)
- `app/api/scheduled-sms/process/route.ts` - Scheduled SMS (unchanged)
- All SMS-related functionality remains with Twilio

---

### 3. **Database Schema - No Changes**

The `conversations` table structure remains the same:
- `modality` field: Still "voice" for voice calls
- `channel_id` field: Will store Vapi call ID instead of Twilio CallSid
- All other fields unchanged

---

### 4. **Agent Configuration - Minor Changes**

#### Current:
- Agent has `phone_number` field (Twilio number)
- Agent has `elevenlabs_voice_id` field (for TTS)

#### New:
- Agent still has `phone_number` field (now used for Vapi number mapping)
- Agent still has `elevenlabs_voice_id` field (Vapi will use this)
- **New field (optional)**: `vapi_assistant_id` - Vapi's assistant ID
  - Can be auto-created or manually configured
  - Used to link agent to Vapi assistant

---

### 5. **Environment Variables - New Additions**

#### New Variables:
- `VAPI_API_KEY` - Your Vapi API key
- `VAPI_PHONE_NUMBER_ID` - (Optional) Vapi phone number ID if using Vapi's numbers

#### Existing Variables (Still Used):
- `ELEVENLABS_API_KEY` - Still needed (Vapi uses this)
- `TWILIO_ACCOUNT_SID` - Still needed for SMS
- `TWILIO_AUTH_TOKEN` - Still needed for SMS
- `OPENAI_API_KEY` - Still needed for agent logic

---

### 6. **What Stays the Same**

✅ **Agent Execution Engine** (`lib/agent-executor/executor.ts`)
- No changes needed
- Processes steps, generates responses
- Works identically for voice and SMS

✅ **SMS Functionality**
- All SMS endpoints unchanged
- Appointment reminders unchanged
- Scheduled SMS unchanged

✅ **Database Schema**
- No migrations needed
- Same conversation tracking

✅ **Agent Builder UI**
- No UI changes needed
- Agents configured the same way

---

## 🛠️ IMPLEMENTATION PLAN: How I'm Going to Change It

### Phase 1: Create Vapi Webhook Handler

**File**: `app/api/vapi/webhook/route.ts`

**What it does:**
1. Receives webhook from Vapi when call starts or user speaks
2. Extracts conversation data from Vapi's payload
3. Finds agent by phone number (same logic as current Twilio handler)
4. Creates/loads conversation in database
5. Executes AgentExecutor with user input
6. Returns JSON response with:
   - `response`: Text response from agent
   - `endCall`: Boolean (true if conversation should end)
   - `voice`: ElevenLabs voice ID configuration

**Key Implementation Details:**
```typescript
// Vapi webhook payload structure:
{
  message: {
    role: "user" | "assistant",
    content: string,
    functionCall?: any
  },
  call: {
    id: string,  // Vapi call ID (like Twilio CallSid)
    phoneNumber: string,  // Phone number called
    customer: {
      number: string  // Customer's phone number
    }
  },
  assistant: {
    id: string  // Vapi assistant ID
  }
}
```

---

### Phase 2: Create Vapi Response Formatter

**File**: `lib/vapi/response.ts`

**What it does:**
1. Formats AgentExecutor output for Vapi
2. Handles conversation state mapping
3. Determines if conversation should end
4. Returns structured JSON response

**Key Functions:**
- `formatVapiResponse()` - Main formatter
- `mapConversationState()` - Maps our state to Vapi format
- `shouldEndCall()` - Determines if call should end

---

### Phase 3: Update Existing Files (Deprecation)

**Files to update:**
1. `app/api/twilio/incoming/route.ts`
   - Add deprecation notice at top
   - Add comment: "This endpoint is deprecated. Voice calls now use Vapi. See /api/vapi/webhook"

2. `app/api/twilio/response/route.ts`
   - Add deprecation notice at top
   - Add comment: "This endpoint is deprecated. Voice calls now use Vapi. See /api/vapi/webhook"

3. `app/api/twilio/continue/route.ts`
   - Add deprecation notice at top
   - Add comment: "This endpoint is deprecated. Vapi handles continuation automatically."

**Why keep them?**
- Reference for understanding old flow
- Fallback if needed during migration
- SMS still uses some Twilio endpoints

---

### Phase 4: Create Setup Documentation

**File**: `docs/VAPI_SETUP.md`

**Contents:**
1. Vapi account setup
2. How to import Twilio numbers into Vapi
3. How to configure ElevenLabs in Vapi
4. How to set up webhook URL
5. How to link agents to Vapi assistants
6. Testing instructions

---

### Phase 5: Database Schema (Optional Enhancement)

**Optional**: Add `vapi_assistant_id` field to agents table
- Not required for initial migration
- Can be added later for better integration
- For now, we'll match agents by phone number

---

## 🔄 Migration Steps (In Order)

### Step 1: Create Vapi Webhook Handler
- Create `app/api/vapi/webhook/route.ts`
- Implement call start logic
- Implement user message handling
- Test with Vapi webhook simulator

### Step 2: Create Response Formatter
- Create `lib/vapi/response.ts`
- Implement response formatting
- Handle conversation state
- Test response format

### Step 3: Integrate with AgentExecutor
- Connect Vapi webhook to AgentExecutor
- Ensure conversation tracking works
- Test full conversation flow

### Step 4: Deprecate Old Endpoints
- Add deprecation notices
- Keep endpoints for reference
- Update documentation

### Step 5: Create Setup Documentation
- Write VAPI_SETUP.md
- Include all configuration steps
- Add troubleshooting guide

### Step 6: Testing
- Test voice call flow end-to-end
- Verify SMS still works
- Test agent execution
- Verify ElevenLabs voices work

---

## 📊 Comparison: Before vs After

### Before (Twilio Voice):
- **Endpoints**: 3 (incoming, response, continue)
- **Response Format**: TwiML (XML)
- **Audio**: Generate URL, Twilio plays it
- **Latency**: 1-2 seconds
- **Complexity**: High (TwiML generation, URL management)

### After (Vapi Voice):
- **Endpoints**: 1 (webhook)
- **Response Format**: JSON
- **Audio**: Vapi handles ElevenLabs directly
- **Latency**: 200-800ms
- **Complexity**: Low (just return text)

---

## ✅ Success Criteria

1. ✅ Voice calls work through Vapi
2. ✅ SMS still works through Twilio
3. ✅ Agent execution logic unchanged
4. ✅ ElevenLabs voices work
5. ✅ Conversation tracking works
6. ✅ Lower latency achieved
7. ✅ No breaking changes to existing functionality

---

## 🚨 Important Notes

1. **SMS Unchanged**: All SMS functionality remains with Twilio
2. **Agent Logic Unchanged**: AgentExecutor works the same
3. **Database Unchanged**: No schema migrations needed
4. **Backward Compatible**: Old Twilio endpoints kept (deprecated)
5. **Gradual Migration**: Can test Vapi alongside Twilio before full switch

---

## 📝 Next Steps After Implementation

1. Configure Vapi account
2. Import Twilio numbers to Vapi
3. Set up ElevenLabs in Vapi
4. Configure webhook URL in Vapi dashboard
5. Test voice calls
6. Monitor latency improvements
7. Gradually migrate all agents


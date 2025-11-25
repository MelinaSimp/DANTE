# Error Fallback Messages

This document lists all the places where error fallback messages are shown to users.

## Chat Interface Errors

### 1. `app/api/conversations/[conversationId]/message/route.ts` (Line 77)
**Error Message**: "I'm sorry, I encountered an error. Please try again."

**Triggered When**: 
- `executor.executeNextStep(message)` returns `success: false`
- The actual error is stored in `result.error` and logged to console

**Location**: This is the API endpoint that handles chat messages

### 2. `app/gigaai/ChatInterface.tsx` (Line 137)
**Error Message**: "I'm sorry, I encountered an error. Please try again."

**Triggered When**:
- The fetch request to `/api/conversations/${convId}/message` fails (network error, 500 error, etc.)
- This is a client-side catch block

**Location**: This is the React component that displays the chat UI

## Voice (Twilio) Errors

### 3. `app/api/twilio/response/route.ts` (Line 179)
**Error Message**: "I'm sorry, I encountered an error. Please try again."

**Triggered When**:
- `executor.executeNextStep(speechResult)` returns `success: false`
- The call is then hung up

**Location**: This handles voice responses from Twilio calls

### 4. `app/api/twilio/response/route.ts` (Line 313)
**Error Message**: "Sorry, we're experiencing technical difficulties. Please try again later."

**Triggered When**:
- An unhandled exception occurs in the try-catch block
- This is the top-level error handler

### 5. `app/api/twilio/incoming/route.ts` (Lines 245, 373)
**Error Message**: "Sorry, we're experiencing technical difficulties. Please try again later."

**Triggered When**:
- Various configuration or setup errors occur during call initialization

## Core Executor Errors

### 6. `lib/agent-executor/executor.ts` (Line 149)
**Error Message**: `error.message || "Execution failed"`

**Triggered When**:
- Any unhandled exception occurs during step execution
- This is caught by the top-level try-catch in `executeNextStep()`

**Common Causes**:
- Step not found
- Database connection issues
- AI/LLM API failures
- Missing configuration
- Invalid step type
- File loading errors (PDF, OCR, etc.)

## How to Debug

1. **Check Server Logs**: All errors are now logged with detailed context including:
   - Error message
   - Stack trace
   - Conversation ID
   - Step ID
   - Agent ID

2. **Check Browser Console**: For chat interface errors, check the browser's developer console

3. **Check Vercel Logs**: For production, check Vercel's function logs

4. **Common Issues**:
   - Missing OpenAI API key
   - Supabase connection issues
   - Missing step/scenario configuration
   - File upload/storage issues
   - PDF/OCR processing failures

## Improving Error Messages

To show more helpful error messages to users, you can:

1. **Update the API route** (`app/api/conversations/[conversationId]/message/route.ts`):
   - Change line 77 to include `result.error` in the message
   - Or create user-friendly error messages based on error type

2. **Update the chat interface** (`app/gigaai/ChatInterface.tsx`):
   - Show the actual error from the API response if available
   - Add retry functionality

3. **Update the executor** (`lib/agent-executor/executor.ts`):
   - Return more descriptive error messages
   - Categorize errors (network, configuration, AI, etc.)


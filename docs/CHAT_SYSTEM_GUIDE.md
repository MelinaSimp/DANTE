# Chat System Handling Guide

## Overview

This guide explains how chat systems are handled in the Drift CRM application, covering architecture, implementation, and best practices.

## Current Architecture

### 1. **Frontend Components**

#### ChatInterface Component (`app/gigaai/ChatInterface.tsx`)
- **Purpose**: Real-time chat UI for chat agents
- **Features**:
  - Message display with timestamps
  - Auto-scroll to latest message
  - Loading states
  - Error handling
  - Conversation persistence

**Key Responsibilities**:
- Display messages (user and assistant)
- Handle user input
- Send messages to API
- Manage conversation state
- Load existing conversations

### 2. **API Layer**

#### Conversation Management (`app/api/conversations/route.ts`)
- **POST `/api/conversations`**: Create new conversation
  - Validates agent exists and is deployed
  - Initializes conversation with first scenario step
  - Returns conversation ID

- **GET `/api/conversations`**: Fetch conversations
  - Supports filtering by `agentId` or `channelId`
  - Returns conversation history

#### Message Processing (`app/api/conversations/[conversationId]/message/route.ts`)
- **POST `/api/conversations/[conversationId]/message`**: Process user message
  - Adds user message to transcript
  - Executes agent steps via AgentExecutor
  - Updates conversation state
  - Returns assistant response

### 3. **Agent Executor** (`lib/agent-executor/executor.ts`)

**Purpose**: Processes messages through agent scenarios

**Flow**:
1. Receives user message
2. Loads current step from conversation
3. Executes step based on type:
   - **Gather**: Extract information from message
   - **Q/A**: Answer questions using data sources
   - **Condition**: Branch based on conditions
   - **Action**: Perform actions (webhooks, etc.)
4. Updates conversation state
5. Returns response and next step

### 4. **Database Schema**

**Conversations Table**:
```sql
- id: UUID (primary key)
- agent_id: UUID (references agents)
- workspace_id: UUID (references workspaces)
- modality: TEXT ('chat', 'voice', 'multi-modal')
- channel_id: TEXT (unique identifier for channel)
- from_number: TEXT (for voice)
- to_number: TEXT (for voice)
- current_scenario_id: UUID
- current_step_id: UUID
- status: TEXT ('active', 'completed', 'archived')
- gathered_data: JSONB (extracted information)
- conversation_state: JSONB (current state)
- transcript: JSONB (message history)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

## Chat System Flow

### 1. **Conversation Initialization**

```
User opens chat → ChatInterface loads
  ↓
Check for existing conversationId
  ↓
If none: Create new conversation via POST /api/conversations
  ↓
Conversation created with:
  - First scenario's first step
  - Empty transcript
  - Initial state
```

### 2. **Message Sending**

```
User types message → Submit
  ↓
Add message to local state (optimistic update)
  ↓
POST /api/conversations/[id]/message
  ↓
Backend:
  1. Add user message to transcript
  2. Load conversation state
  3. Execute agent step via AgentExecutor
  4. Update conversation (transcript, state, next step)
  5. Return assistant response
  ↓
Frontend receives response
  ↓
Add assistant message to UI
```

### 3. **Agent Step Execution**

```
AgentExecutor.executeNextStep(message)
  ↓
Load current step from database
  ↓
Execute based on step type:
  
  Gather Step:
    - Extract information using OpenAI
    - Store in gathered_data
    - Move to next step
    
  Q/A Step:
    - Query data sources
    - Generate answer
    - Generate follow-up questions
    - Continue conversation loop
    
  Condition Step:
    - Evaluate condition
    - Branch to appropriate step
    
  Action Step:
    - Execute action (webhook, etc.)
    - Move to next step
  ↓
Return result with:
  - Output message
  - Next step ID
  - Updated gathered data
  - Should continue flag
```

## Best Practices

### 1. **State Management**

**Do**:
- Keep conversation state in database (single source of truth)
- Use optimistic updates for better UX
- Sync local state with server state
- Handle race conditions (disable input during processing)

**Don't**:
- Store conversation state only in frontend
- Allow multiple simultaneous requests
- Ignore error states

### 2. **Error Handling**

**Current Implementation**:
```typescript
try {
  const response = await fetch(...);
  if (!response.ok) throw new Error("Failed");
  // Process response
} catch (error) {
  // Show user-friendly error message
  setMessages(prev => [...prev, errorMessage]);
}
```

**Best Practices**:
- Always show user-friendly error messages
- Log errors for debugging
- Retry failed requests (with exponential backoff)
- Handle network failures gracefully

### 3. **Performance Optimization**

**Current**:
- Auto-scroll to latest message
- Loading indicators
- Optimistic updates

**Additional Optimizations**:
- Debounce rapid messages
- Paginate message history for long conversations
- Lazy load conversation history
- Cache agent configurations

### 4. **Security**

**Current**:
- Authentication required for all endpoints
- Workspace isolation (RLS policies)
- Agent ownership validation

**Additional Considerations**:
- Rate limiting per user/agent
- Input sanitization
- XSS prevention (React handles this)
- CSRF protection (Next.js handles this)

## Common Patterns

### 1. **Conversation Persistence**

```typescript
// Save conversation state after each message
await supabase
  .from("conversations")
  .update({
    transcript: updatedTranscript,
    gathered_data: updatedGatheredData,
    current_step_id: nextStepId,
    updated_at: new Date().toISOString()
  })
  .eq("id", conversationId);
```

### 2. **Loading Existing Conversations**

```typescript
// Load conversation on mount
useEffect(() => {
  if (conversationId) {
    loadConversation(conversationId);
  }
}, [conversationId]);

const loadConversation = async (id: string) => {
  const response = await fetch(`/api/conversations?channelId=${id}`);
  const conversations = await response.json();
  if (conversations.length > 0) {
    setMessages(conversations[0].transcript || []);
  }
};
```

### 3. **Message Format**

```typescript
interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// Stored in transcript as JSONB array
transcript: [
  { role: "user", content: "Hello", timestamp: "2024-01-01T00:00:00Z" },
  { role: "assistant", content: "Hi there!", timestamp: "2024-01-01T00:00:01Z" }
]
```

## Improvements & Enhancements

### 1. **Real-time Updates** (WebSockets/SSE)
- Currently: Polling or manual refresh
- Enhancement: WebSocket connection for real-time message delivery
- Use Supabase Realtime or Socket.io

### 2. **Typing Indicators**
```typescript
// Show "AI is typing..." while processing
const [isTyping, setIsTyping] = useState(false);

// In message handler:
setIsTyping(true);
const response = await fetch(...);
setIsTyping(false);
```

### 3. **Message Status**
- Sent ✓
- Delivered ✓✓
- Read ✓✓ (blue)
- Failed ✗

### 4. **Rich Media Support**
- Images
- Files
- Links (preview)
- Buttons/Quick replies

### 5. **Conversation History**
- List all conversations
- Search conversations
- Filter by date, agent, status
- Export conversations

### 6. **Multi-user Support**
- Multiple users in same conversation
- User mentions (@username)
- Read receipts
- Typing indicators per user

### 7. **Message Reactions**
- Emoji reactions
- Thumbs up/down
- Feedback collection

### 8. **Context Window Management**
- For long conversations, summarize old messages
- Keep recent context, archive old messages
- Token counting and limits

## Testing Chat Systems

### 1. **Unit Tests**
- Test message formatting
- Test state updates
- Test error handling

### 2. **Integration Tests**
- Test full conversation flow
- Test API endpoints
- Test agent executor

### 3. **E2E Tests**
- Test user sends message → receives response
- Test conversation persistence
- Test error scenarios

## Troubleshooting

### Common Issues

1. **Messages not appearing**
   - Check network tab for API calls
   - Verify conversation ID is correct
   - Check transcript in database

2. **Agent not responding**
   - Verify agent is deployed
   - Check agent executor logs
   - Verify OpenAI API key

3. **State not persisting**
   - Check database update queries
   - Verify RLS policies
   - Check for transaction conflicts

4. **Slow responses**
   - Check OpenAI API latency
   - Optimize agent executor
   - Add caching where possible

## Summary

The chat system follows a clean architecture:
- **Frontend**: React components for UI
- **API**: REST endpoints for conversation management
- **Executor**: Agent step processing
- **Database**: Persistent storage with RLS

Key principles:
- ✅ State in database (single source of truth)
- ✅ Optimistic UI updates
- ✅ Error handling at every layer
- ✅ Security through authentication and RLS
- ✅ Scalable architecture

For questions or improvements, refer to the codebase or create an issue.






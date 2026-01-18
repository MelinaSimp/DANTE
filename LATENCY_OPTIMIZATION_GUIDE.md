# Voice Agent Latency Optimization Guide

## Current Optimizations ✅ (Already Implemented)

1. **Reduced OpenAI tokens**: 500 → 150 tokens
2. **Lower temperature**: 0.7 → 0.3 (faster inference)
3. **Reduced context**: 10 → 5 transcript messages
4. **Truncated prompts**: Policies/data sources limited to 300 chars
5. **Optimized ElevenLabs**: Lower stability/similarity for faster generation

## Additional Optimization Strategies

### 1. **Parallelize Database Updates with TTS Generation** ⚡ HIGH IMPACT

**Current Flow:**
```
AI Response → Database Update → TTS Generation → Return TwiML
```

**Optimized Flow:**
```
AI Response → [Database Update + TTS Generation in parallel] → Return TwiML
```

**Implementation:**
- Start TTS generation immediately after getting AI response
- Update database in parallel (don't wait for TTS)
- Both complete around the same time, saving ~500-1000ms

### 2. **Streaming TTS (Start Playing While Generating)** 🚀 VERY HIGH IMPACT

**Current:** Generate full audio, then play
**Optimized:** Start playing audio as soon as first chunk is ready

**Implementation Options:**
- Use ElevenLabs streaming API (if available)
- Generate audio in chunks and stream to Twilio
- Use Twilio Media Streams for real-time bidirectional audio

**Expected Savings:** 1-2 seconds

### 3. **Pre-generate Common Responses** 💾 MEDIUM IMPACT

**Strategy:**
- Identify common greetings/responses
- Pre-generate audio files at agent deployment
- Store in cache/CDN
- Serve instantly (0ms latency)

**Common Phrases to Pre-generate:**
- Greetings ("Hello, how can I help you?")
- Confirmations ("Got it, let me help with that")
- Transitions ("Let me check that for you")
- Closings ("Is there anything else I can help with?")

### 4. **Aggressive Response Caching** 🎯 HIGH IMPACT

**Current:** Only Q/A steps are cached
**Optimized:** Cache all AI responses based on:
- User input (normalized)
- Current step ID
- Conversation context hash

**Implementation:**
- Cache key: `agentId:stepId:normalizedInput:contextHash`
- TTL: 24 hours (or configurable)
- Check cache BEFORE OpenAI API call

**Expected Savings:** 2-3 seconds for repeated questions

### 5. **Parallelize Database Queries** ⚡ MEDIUM IMPACT

**Current Sequential Queries:**
```typescript
const conversation = await loadConversation();
const agent = await loadAgent();
const step = await loadStep();
```

**Optimized Parallel Queries:**
```typescript
const [conversation, agent, step] = await Promise.all([
  loadConversation(),
  loadAgent(),
  loadStep()
]);
```

**Expected Savings:** 100-300ms

### 6. **Reduce OpenAI Model Latency** 🎯 HIGH IMPACT

**Options:**
- Use `gpt-3.5-turbo` instead of `gpt-4o-mini` (faster, cheaper)
- Use `gpt-4o-mini` with `stream: true` (already implemented for Q/A)
- Reduce max_tokens further: 150 → 100 (if responses are short enough)

**Trade-offs:**
- `gpt-3.5-turbo`: Faster but less capable
- Lower tokens: Faster but may truncate responses

### 7. **Use Twilio Media Streams** 🚀 VERY HIGH IMPACT (Advanced)

**Current:** Twilio `<Gather>` has 1-2 second latency
**Optimized:** Media Streams for real-time bidirectional audio

**Benefits:**
- Real-time audio streaming (200-500ms latency)
- Interrupt handling (barge-in)
- Lower overall latency

**Implementation Complexity:** High (requires WebSocket handling)

### 8. **Optimize ElevenLabs Settings Further** ⚡ LOW-MEDIUM IMPACT

**Current Settings:**
- Model: `eleven_turbo_v2_5` ✅
- Stability: 0.15
- Similarity: 0.4
- Format: `mp3_22050_32`

**Further Optimizations:**
- Use even lower quality format (if acceptable)
- Reduce text length before TTS (truncate if > 200 chars)
- Use faster ElevenLabs model if available

### 9. **Background Processing** 🔄 MEDIUM IMPACT

**Strategy:**
- Don't wait for non-critical operations
- Fire-and-forget for:
  - Response caching
  - Analytics/logging
  - Database updates (if not needed for response)

**Implementation:**
```typescript
// Don't await - fire and forget
cacheResponse(key, response).catch(err => console.error(err));
updateAnalytics(data).catch(err => console.error(err));
```

### 10. **CDN for Audio Files** 🌐 MEDIUM IMPACT

**Strategy:**
- Store generated audio files in CDN (Vercel Blob, Cloudflare R2)
- Serve from edge locations
- Faster delivery to Twilio

**Expected Savings:** 200-500ms for audio delivery

## Priority Ranking

1. **🚀 Streaming TTS** - Highest impact (1-2s savings)
2. **⚡ Parallelize DB + TTS** - Easy win (500-1000ms savings)
3. **🎯 Aggressive Caching** - High impact for repeated queries (2-3s savings)
4. **⚡ Parallelize DB Queries** - Easy win (100-300ms savings)
5. **💾 Pre-generate Common Responses** - Medium impact (0ms for cached)
6. **🎯 Reduce OpenAI Tokens Further** - Easy win (200-500ms savings)
7. **🔄 Background Processing** - Easy win (100-200ms savings)
8. **🌐 CDN for Audio** - Medium impact (200-500ms savings)
9. **🚀 Twilio Media Streams** - Highest impact but complex (1-2s savings)
10. **⚡ Further ElevenLabs Optimization** - Low impact (100-200ms savings)

## Expected Total Latency Reduction

**Current:** ~3-4 seconds
**With Priority 1-5:** ~1.5-2 seconds
**With All Optimizations:** ~0.5-1 second

## Quick Wins (Easy to Implement)

1. Parallelize database updates with TTS generation
2. Parallelize database queries
3. Reduce max_tokens to 100
4. Background processing for non-critical operations
5. More aggressive response caching

## Implementation Notes

- Test each optimization individually
- Monitor latency metrics
- Balance speed vs. quality
- Consider user experience (don't sacrifice too much quality for speed)




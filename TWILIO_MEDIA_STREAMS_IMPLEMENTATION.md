# Twilio Media Streams Implementation Guide

## Overview

Twilio Media Streams enables real-time bidirectional audio streaming for ultra-low latency (200-500ms vs 1-2 seconds with traditional Gather).

## Architecture Challenge

**Problem:** Next.js API routes don't support persistent WebSocket connections.

**Solutions:**

### Option 1: Separate WebSocket Server (Recommended)
- Run a Node.js/Express server with WebSocket support
- Deploy separately (Railway, Render, Fly.io, or EC2)
- Handle Media Streams WebSocket connections
- Communicate with Next.js API via HTTP for agent execution

### Option 2: Serverless WebSocket Service
- Use Pusher, Ably, or similar service
- Handle WebSocket connections via their infrastructure
- Integrate with Next.js API

### Option 3: Vercel Edge Functions (If Available)
- Use Vercel's WebSocket support (if/when available)
- Deploy as Edge Function

## Implementation Plan

### Phase 1: Quick Wins (Already Done)
✅ Parallel database queries
✅ Parallel TTS generation with DB updates
✅ Response caching

### Phase 2: Media Streams Setup

1. **Create WebSocket Server** (separate Node.js app)
   - Handle Twilio Media Streams WebSocket connections
   - Process audio chunks in real-time
   - Send audio to ElevenLabs for TTS
   - Stream responses back to Twilio

2. **Update Twilio Configuration**
   - Enable Media Streams in phone number settings
   - Set WebSocket URL to your WebSocket server

3. **Integrate with Next.js**
   - WebSocket server calls Next.js API for agent execution
   - Next.js returns text responses
   - WebSocket server converts to audio and streams

## Next Steps

1. Deploy separate WebSocket server
2. Configure Twilio Media Streams
3. Test end-to-end flow

## Files Created

- `app/api/twilio/media-stream/route.ts` - Initial Media Streams handler (returns TwiML for now)

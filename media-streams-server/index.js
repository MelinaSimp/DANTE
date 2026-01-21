/**
 * Twilio Media Streams WebSocket Server
 * 
 * This is a standalone Node.js server that handles Twilio Media Streams
 * WebSocket connections for real-time bidirectional audio streaming.
 * 
 * Deploy this separately (Railway, Render, Fly.io, or EC2)
 * 
 * Usage:
 *   npm install ws
 *   node index.js
 * 
 * Environment Variables:
 *   PORT=3001
 *   NEXTJS_API_URL=https://driftai.studio
 *   ELEVENLABS_API_KEY=your_key
 */

const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3001;
const NEXTJS_API_URL = process.env.NEXTJS_API_URL || 'https://driftai.studio';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Store active connections
const activeConnections = new Map();

// Create HTTP server
const server = http.createServer();

// Health check endpoint (handle before WebSocket upgrades)
server.on('request', (req, res) => {
  if (req.url === '/health' || req.url === '/health/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      connections: activeConnections.size,
      timestamp: new Date().toISOString(),
    }));
  } else if (req.url === '/media-stream') {
    // WebSocket upgrade request - let WebSocket server handle it
    res.writeHead(426, { 'Upgrade': 'websocket' });
    res.end('WebSocket upgrade required');
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// Create WebSocket server
const wss = new WebSocket.Server({ 
  server,
  path: '/media-stream',
  perMessageDeflate: false, // Disable compression for lower latency
  clientTracking: true,
});

wss.on('connection', (ws, req) => {
  const connectionId = uuidv4();
  
  // Handle both http:// and https:// for URL parsing
  const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  
  // req.url might not include query params, check req.url first, then parse
  let requestUrl = req.url || '/media-stream';
  const url = new URL(requestUrl, `${protocol}://${host}`);
  
  const callSid = url.searchParams.get('CallSid') || '';
  const from = url.searchParams.get('From') || '';
  const to = url.searchParams.get('To') || '';
  const conversationId = url.searchParams.get('conversationId') || '';

  console.log(`[Media Stream] ✅ New connection: ${connectionId}`, { callSid, from, to, conversationId });
  console.log(`[Media Stream] Request URL: ${req.url}`);
  console.log(`[Media Stream] Full URL with query: ${requestUrl}`);
  console.log(`[Media Stream] Parsed conversationId: "${conversationId}"`);
  
  if (!conversationId) {
    console.warn(`[Media Stream] ⚠️ WARNING: conversationId is missing from URL parameters!`);
    console.warn(`[Media Stream] URL search params:`, Object.fromEntries(url.searchParams));
  }

  const connection = {
    id: connectionId,
    callSid,
    from,
    to,
    conversationId,
    ws,
    audioBuffer: Buffer.alloc(0),
    isConnected: true,
    lastActivity: Date.now(),
  };

  activeConnections.set(connectionId, connection);

  // Handle incoming messages from Twilio
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.event === 'connected') {
        console.log(`[Media Stream] Connected: ${connectionId}`);
      } else if (data.event === 'start') {
        console.log(`[Media Stream] Stream started: ${connectionId}`, data.start);
        connection.streamSid = data.start.streamSid;
        
        // Send initial greeting when stream starts
        sendInitialGreeting(connection);
        
        // Send initial greeting when stream starts
        sendInitialGreeting(connection);
      } else if (data.event === 'media') {
        // Received audio chunk from caller
        const audioPayload = data.media.payload;
        const audioChunk = Buffer.from(audioPayload, 'base64');
        
        // Accumulate audio for speech-to-text processing
        connection.audioBuffer = Buffer.concat([connection.audioBuffer, audioChunk]);
        
        // Process audio chunks (every 2 seconds or when buffer is large enough)
        if (connection.audioBuffer.length > 32000) { // ~2 seconds of audio at 8kHz
          await processAudioChunk(connection);
        }
      } else if (data.event === 'stop') {
        console.log(`[Media Stream] Stream stopped: ${connectionId}`);
        cleanupConnection(connectionId);
      }
    } catch (error) {
      console.error(`[Media Stream] Error processing message: ${error.message}`);
    }
  });

  ws.on('close', () => {
    console.log(`[Media Stream] Connection closed: ${connectionId}`);
    cleanupConnection(connectionId);
  });

  ws.on('error', (error) => {
    console.error(`[Media Stream] WebSocket error: ${error.message}`);
    cleanupConnection(connectionId);
  });

  // Send initial connection message
  ws.send(JSON.stringify({
    event: 'connected',
    protocol: 'Call',
    version: '1.0.0'
  }));
});

/**
 * Process accumulated audio chunk for speech-to-text
 */
async function processAudioChunk(connection) {
  if (connection.audioBuffer.length === 0) return;

  try {
    // For now, we'll use Twilio's speech recognition via the regular API
    // In production, you might want to use a real-time STT service
    
    // Send audio to Next.js API for processing
    const response = await fetch(`${NEXTJS_API_URL}/api/twilio/media-stream-process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        callSid: connection.callSid,
        conversationId: connection.conversationId,
        audioBase64: connection.audioBuffer.toString('base64'),
      }),
    });

    if (response.ok) {
      const result = await response.json();
      
      if (result.text && result.text.trim().length > 0) {
        // Process the transcribed text through agent executor
        await processUserInput(connection, result.text);
      }
    }

    // Clear buffer after processing
    connection.audioBuffer = Buffer.alloc(0);
  } catch (error) {
    console.error(`[Media Stream] Error processing audio: ${error.message}`);
  }
}

/**
 * Send initial greeting when stream starts
 */
async function sendInitialGreeting(connection) {
  try {
    if (!connection.conversationId) {
      console.warn(`[Media Stream] No conversationId, skipping greeting`);
      return;
    }

    console.log(`[Media Stream] Sending initial greeting for conversation: ${connection.conversationId}`);

    // Call Next.js API to get the greeting (empty input triggers greeting)
    const response = await fetch(`${NEXTJS_API_URL}/api/twilio/media-stream-execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: connection.conversationId,
        userInput: '', // Empty input triggers greeting
      }),
    });

    if (response.ok) {
      const result = await response.json();
      
      if (result.output && result.output.trim().length > 0) {
        // Stream the greeting audio
        await streamAudioResponse(connection, result.output, result.voiceId);
      }
    } else {
      console.error(`[Media Stream] Failed to get greeting: ${response.status}`);
    }
  } catch (error) {
    console.error(`[Media Stream] Error sending initial greeting: ${error.message}`);
  }
}

/**
 * Process user input through agent executor
 */
async function processUserInput(connection, userInput) {
  try {
    console.log(`[Media Stream] Processing user input: "${userInput}"`);

    // Call Next.js API to execute agent step
    const response = await fetch(`${NEXTJS_API_URL}/api/twilio/media-stream-execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: connection.conversationId,
        userInput: userInput,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      
      if (result.output && result.output.trim().length > 0) {
        // Convert text to speech and stream back
        await streamAudioResponse(connection, result.output, result.voiceId);
      }
    }
  } catch (error) {
    console.error(`[Media Stream] Error processing user input: ${error.message}`);
  }
}

/**
 * Convert text to speech and stream audio back to Twilio
 */
async function streamAudioResponse(connection, text, voiceId) {
  try {
    if (!ELEVENLABS_API_KEY || !voiceId) {
      console.warn('[Media Stream] No ElevenLabs API key or voice ID, skipping TTS');
      return;
    }

    // Generate audio from ElevenLabs
    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.15,
            similarity_boost: 0.4,
          },
          output_format: 'pcm_16000', // PCM format for Media Streams
        }),
      }
    );

    if (!ttsResponse.ok) {
      console.error('[Media Stream] ElevenLabs TTS error:', ttsResponse.status);
      return;
    }

    // Stream audio chunks to Twilio
    const audioBuffer = await ttsResponse.arrayBuffer();
    const audioData = Buffer.from(audioBuffer);
    
    // Send audio in chunks (Media Streams expects base64-encoded PCM)
    const chunkSize = 1600; // 100ms of audio at 16kHz
    for (let i = 0; i < audioData.length; i += chunkSize) {
      const chunk = audioData.slice(i, i + chunkSize);
      const base64Chunk = chunk.toString('base64');
      
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.send(JSON.stringify({
          event: 'media',
          streamSid: connection.streamSid,
          media: {
            payload: base64Chunk,
          },
        }));
      }
    }
  } catch (error) {
    console.error(`[Media Stream] Error streaming audio: ${error.message}`);
  }
}

/**
 * Cleanup connection
 */
function cleanupConnection(connectionId) {
  const connection = activeConnections.get(connectionId);
  if (connection) {
    connection.isConnected = false;
    activeConnections.delete(connectionId);
    console.log(`[Media Stream] Cleaned up connection: ${connectionId}`);
  }
}

// Handle WebSocket upgrade requests (for debugging)
server.on('upgrade', (request, socket, head) => {
  console.log(`[Media Stream] Upgrade request received for: ${request.url}`);
  console.log(`[Media Stream] Headers:`, JSON.stringify(request.headers, null, 2));
});

// Start server - bind to 0.0.0.0 to accept connections from Railway's reverse proxy
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Media Stream] WebSocket server listening on port ${PORT}`);
  console.log(`[Media Stream] Next.js API URL: ${NEXTJS_API_URL}`);
  console.log(`[Media Stream] Server bound to 0.0.0.0 (accepting external connections)`);
});

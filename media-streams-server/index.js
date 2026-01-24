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
const { v4: uuidv4 } = require('uuid');
const alawmulaw = require('alawmulaw');

const PORT = process.env.PORT || 3001;
const NEXTJS_API_URL = process.env.NEXTJS_API_URL || 'https://driftai.studio';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Store active connections
const activeConnections = new Map();

// Create HTTP server
const server = http.createServer();

// Health check endpoint (handle before WebSocket upgrades)
// CRITICAL: For /media-stream with Upgrade: websocket, do NOT respond here —
// the WebSocket server handles the upgrade. Responding (404/426) would prevent Twilio from connecting.
server.on('request', (req, res) => {
  const path = (req.url || '').split('?')[0];
  const isMediaStream = path === '/media-stream';
  const isUpgrade = (req.headers['upgrade'] || '').toLowerCase() === 'websocket';

  if (req.url === '/health' || req.url === '/health/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      connections: activeConnections.size,
      timestamp: new Date().toISOString(),
    }));
  } else if (isMediaStream && isUpgrade) {
    // WebSocket upgrade — do not respond; let ws server handle it
    return;
  } else if (isMediaStream) {
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

  sendLog('info', `✅ New WebSocket connection: ${connectionId}`, { callSid, from, to, conversationId, requestUrl: req.url });
  
  if (!conversationId) {
    sendLog('warn', `⚠️ WARNING: conversationId is missing from URL parameters!`, { 
      callSid, 
      from, 
      to, 
      urlParams: Object.fromEntries(url.searchParams) 
    });
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
        sendLog('info', `WebSocket connected: ${connectionId}`, { connectionId });
      } else if (data.event === 'start') {
        sendLog('info', `Stream started: ${connectionId}`, { connectionId, streamSid: data.start.streamSid, callSid: data.start.callSid });
        connection.streamSid = data.start.streamSid;
        
        // Update callSid from start event (it's more reliable than URL params)
        if (data.start.callSid) {
          connection.callSid = data.start.callSid;
          sendLog('info', `Got callSid from start event: "${connection.callSid}"`, { callSid: connection.callSid });
        }
        
        // Try to get conversationId from customParameters (Twilio <Parameter name="conversationId" value="..." />)
        if (!connection.conversationId && data.start.customParameters) {
          const cp = data.start.customParameters;
          connection.conversationId = (cp.conversationId || cp.ConversationId || '') + '';
          if (connection.conversationId) {
            sendLog('info', `Got conversationId from customParameters: "${connection.conversationId}"`, { conversationId: connection.conversationId });
          }
        }
        
        // If conversationId is still missing, look it up by callSid
        if (!connection.conversationId && connection.callSid) {
          sendLog('info', `Looking up conversation by callSid: "${connection.callSid}"`, { callSid: connection.callSid });
          try {
            const lookupResponse = await fetch(`${NEXTJS_API_URL}/api/twilio/media-stream-lookup`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ callSid: connection.callSid }),
            });
            
            if (lookupResponse.ok) {
              const lookupData = await lookupResponse.json();
              if (lookupData.conversationId) {
                connection.conversationId = lookupData.conversationId;
                sendLog('info', `✅ Found conversationId: "${connection.conversationId}"`, { conversationId: connection.conversationId, callSid: connection.callSid });
              } else {
                sendLog('warn', `Lookup ok but no conversationId in body`, { callSid: connection.callSid });
              }
            } else {
              const errBody = await lookupResponse.text();
              sendLog('error', `Lookup failed: ${lookupResponse.status}`, { callSid: connection.callSid, error: errBody });
            }
          } catch (error) {
            sendLog('error', `Error looking up conversation: ${error.message}`, { callSid: connection.callSid, error: error.message });
          }
        }
        
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
        sendLog('info', `Stream stopped: ${connectionId}`, { connectionId });
        cleanupConnection(connectionId);
      }
    } catch (error) {
      console.error(`[Media Stream] Error processing message: ${error.message}`);
    }
  });

  ws.on('close', () => {
    sendLog('info', `WebSocket connection closed: ${connectionId}`, { connectionId });
    cleanupConnection(connectionId);
  });

  ws.on('error', (error) => {
    sendLog('error', `WebSocket error: ${error.message}`, { connectionId, error: error.message });
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
      sendLog('warn', `No conversationId, skipping greeting`, { connectionId: connection.id });
      return;
    }

    const startTime = Date.now();
    sendLog('info', `Sending initial greeting for conversation: ${connection.conversationId}`, { conversationId: connection.conversationId });

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

    const responseTime = Date.now() - startTime;
    if (response.ok) {
      const result = await response.json();
      if (result.output && result.output.trim().length > 0) {
        sendLog('info', `Greeting received (${result.output.length} chars) in ${responseTime}ms`, { 
          conversationId: connection.conversationId, 
          responseTime,
          outputLength: result.output.length 
        });
        await streamAudioResponse(connection, result.output, result.voiceId);
      } else {
        sendLog('warn', `Greeting API ok but no output`, { conversationId: connection.conversationId, responseTime });
      }
    } else {
      const errBody = await response.text();
      sendLog('error', `Failed to get greeting: ${response.status}`, { 
        conversationId: connection.conversationId, 
        status: response.status, 
        error: errBody,
        responseTime 
      });
    }
  } catch (error) {
    sendLog('error', `Error sending initial greeting: ${error.message}`, { 
      conversationId: connection.conversationId, 
      error: error.message 
    });
  }
}

/**
 * Process user input through agent executor
 */
async function processUserInput(connection, userInput) {
  try {
    const startTime = Date.now();
    sendLog('info', `Processing user input: "${userInput}"`, { 
      conversationId: connection.conversationId, 
      userInput: userInput.substring(0, 100) // Truncate for logs
    });

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

    const responseTime = Date.now() - startTime;
    if (response.ok) {
      const result = await response.json();
      
      if (result.output && result.output.trim().length > 0) {
        sendLog('info', `Agent response received (${result.output.length} chars) in ${responseTime}ms`, { 
          conversationId: connection.conversationId, 
          responseTime,
          outputLength: result.output.length 
        });
        // Convert text to speech and stream back
        await streamAudioResponse(connection, result.output, result.voiceId);
      } else {
        sendLog('warn', `Agent response ok but no output`, { conversationId: connection.conversationId, responseTime });
      }
    } else {
      const errBody = await response.text();
      sendLog('error', `Agent execution failed: ${response.status}`, { 
        conversationId: connection.conversationId, 
        status: response.status, 
        error: errBody,
        responseTime 
      });
    }
  } catch (error) {
    sendLog('error', `Error processing user input: ${error.message}`, { 
      conversationId: connection.conversationId, 
      error: error.message 
    });
  }
}

/** Default ElevenLabs voice (Rachel) when agent has none */
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

/**
 * Convert PCM 16kHz 16-bit LE to mulaw 8kHz for Twilio Media Streams.
 * Twilio requires audio/x-mulaw, 8000 Hz, base64.
 */
function pcm16kToMulaw8k(pcmBuffer) {
  const numSamples = Math.floor(pcmBuffer.length / 2);
  const pcm16 = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    pcm16[i] = pcmBuffer.readInt16LE(i * 2);
  }
  // Downsample 16kHz -> 8kHz (take every other sample)
  const pcm8k = new Int16Array(Math.floor(numSamples / 2));
  for (let i = 0; i < pcm8k.length; i++) {
    pcm8k[i] = pcm16[i * 2];
  }
  return Buffer.from(alawmulaw.mulaw.encode(pcm8k));
}

/**
 * Convert text to speech and stream audio back to Twilio.
 * Twilio Media Streams require mulaw 8kHz base64 — we request PCM 16kHz from ElevenLabs,
 * then downsample and encode to mulaw.
 */
async function streamAudioResponse(connection, text, voiceId) {
  try {
    const ttsStartTime = Date.now();
    const effectiveVoiceId = voiceId || DEFAULT_VOICE_ID;
    if (!ELEVENLABS_API_KEY) {
      sendLog('warn', `No ElevenLabs API key, skipping TTS`, { conversationId: connection.conversationId });
      return;
    }
    
    sendLog('info', `Starting TTS generation for ${text.length} chars`, { 
      conversationId: connection.conversationId, 
      voiceId: effectiveVoiceId,
      textLength: text.length 
    });

    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${effectiveVoiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/pcm',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.15, similarity_boost: 0.4 },
          output_format: 'pcm_16000',
        }),
      }
    );

    const ttsResponseTime = Date.now() - ttsStartTime;
    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      sendLog('error', `ElevenLabs TTS error: ${ttsResponse.status}`, { 
        conversationId: connection.conversationId, 
        status: ttsResponse.status, 
        error: errorText,
        responseTime: ttsResponseTime 
      });
      return;
    }

    const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
    const mulaw8k = pcm16kToMulaw8k(audioBuffer);
    
    sendLog('info', `TTS generated (${audioBuffer.length} bytes) in ${ttsResponseTime}ms, streaming to Twilio`, { 
      conversationId: connection.conversationId, 
      audioSize: audioBuffer.length,
      mulawSize: mulaw8k.length,
      responseTime: ttsResponseTime 
    });

    // Twilio expects mulaw 8kHz; 100ms = 800 bytes
    const chunkSize = 800;
    let chunksSent = 0;
    for (let i = 0; i < mulaw8k.length; i += chunkSize) {
      const chunk = mulaw8k.slice(i, i + chunkSize);
      const base64Chunk = chunk.toString('base64');
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.send(JSON.stringify({
          event: 'media',
          streamSid: connection.streamSid,
          media: { payload: base64Chunk },
        }));
        chunksSent++;
      }
    }
    
    const totalTime = Date.now() - ttsStartTime;
    sendLog('info', `Audio streamed to Twilio (${chunksSent} chunks) in ${totalTime}ms total`, { 
      conversationId: connection.conversationId, 
      chunksSent,
      totalTime 
    });
  } catch (error) {
    sendLog('error', `Error streaming audio: ${error.message}`, { 
      conversationId: connection.conversationId, 
      error: error.message 
    });
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
  sendLog('info', `WebSocket server started`, { 
    port: PORT, 
    nextjsApiUrl: NEXTJS_API_URL,
    elevenlabsConfigured: !!ELEVENLABS_API_KEY 
  });
  console.log(`[Media Stream] WebSocket server listening on port ${PORT}`);
  console.log(`[Media Stream] Next.js API URL: ${NEXTJS_API_URL}`);
  console.log(`[Media Stream] Server bound to 0.0.0.0 (accepting external connections)`);
});

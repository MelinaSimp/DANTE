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
  
  console.log(`[Media Stream] 🔌 NEW WEBSOCKET CONNECTION: ${connectionId}`);
  console.log(`[Media Stream] Request URL: ${req.url}`);
  console.log(`[Media Stream] Headers:`, JSON.stringify(req.headers, null, 2));
  
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
    lastProcessTime: 0, // Track when we last processed audio
    processTimer: null, // Timer for periodic processing
  };

  activeConnections.set(connectionId, connection);

  // Handle incoming messages from Twilio
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      // Log all events for debugging
      console.log(`[Media Stream] 📨 Received event: ${data.event} for connection: ${connectionId}`);
      
      if (data.event === 'connected') {
        console.log(`[Media Stream] 🔗 Connected event received for: ${connectionId}`);
      } else if (data.event === 'start') {
        console.log(`[Media Stream] 🚀 START event received for: ${connectionId}`);
        console.log(`[Media Stream] Start data:`, JSON.stringify(data.start, null, 2));
        connection.streamSid = data.start.streamSid;
        console.log(`[Media Stream] Stream SID: ${connection.streamSid}`);
        
        // Update callSid from start event (it's more reliable than URL params)
        if (data.start.callSid) {
          connection.callSid = data.start.callSid;
          console.log(`[Media Stream] Got callSid from start event: "${connection.callSid}"`);
        }
        
        // Try to get conversationId from customParameters (Twilio <Parameter name="conversationId" value="..." />)
        if (!connection.conversationId && data.start.customParameters) {
          const cp = data.start.customParameters;
          connection.conversationId = (cp.conversationId || cp.ConversationId || '') + '';
          if (connection.conversationId) {
            console.log(`[Media Stream] Got conversationId from customParameters: "${connection.conversationId}"`);
          }
        }
        
        // If conversationId is still missing, look it up by callSid
        if (!connection.conversationId && connection.callSid) {
          console.log(`[Media Stream] Looking up conversation by callSid: "${connection.callSid}"`);
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
                console.log(`[Media Stream] ✅ Found conversationId: "${connection.conversationId}"`);
              } else {
                console.warn(`[Media Stream] Lookup ok but no conversationId in body`);
              }
            } else {
              const errBody = await lookupResponse.text();
              console.warn(`[Media Stream] Lookup failed: ${lookupResponse.status} ${errBody}`);
            }
          } catch (error) {
            console.error(`[Media Stream] Error looking up conversation: ${error.message}`);
          }
        }
        
        // Send initial greeting when stream starts
        // Add delay to ensure Twilio stream is fully initialized and ready to receive audio
        console.log(`[Media Stream] 📅 Scheduling greeting in 500ms. conversationId: ${connection.conversationId || 'MISSING'}, callSid: ${connection.callSid || 'MISSING'}`);
        setTimeout(() => {
          console.log(`[Media Stream] ⏳ Delay complete, sending greeting...`);
          console.log(`[Media Stream] 🔍 Connection state: conversationId=${connection.conversationId || 'MISSING'}, callSid=${connection.callSid || 'MISSING'}, ws.readyState=${connection.ws?.readyState || 'NO_WS'}`);
          sendInitialGreeting(connection);
        }, 500); // 500ms delay to ensure stream is fully ready
      } else if (data.event === 'media') {
        // Received audio chunk from caller
        const audioPayload = data.media.payload;
        const audioChunk = Buffer.from(audioPayload, 'base64');
        
        // Accumulate audio for speech-to-text processing
        connection.audioBuffer = Buffer.concat([connection.audioBuffer, audioChunk]);
        connection.lastActivity = Date.now();
        
        // Process audio chunks more frequently for better responsiveness
        // 12000 bytes = ~1.5 seconds of mulaw 8kHz audio
        // Also process if we haven't processed in 2 seconds (catches short utterances)
        const timeSinceLastProcess = Date.now() - connection.lastProcessTime;
        const shouldProcess = connection.audioBuffer.length > 12000 || (timeSinceLastProcess > 2000 && connection.audioBuffer.length > 4000);
        
        if (shouldProcess && connection.audioBuffer.length > 0) {
          console.log(`[Media Stream] 📊 Processing audio: ${connection.audioBuffer.length} bytes, ${timeSinceLastProcess}ms since last process`);
          connection.lastProcessTime = Date.now();
          await processAudioChunk(connection);
        }
      } else if (data.event === 'stop') {
        console.log(`[Media Stream] Stream stopped: ${connectionId}`);
        cleanupConnection(connectionId);
      } else if (data.event === 'mark') {
        console.log(`[Media Stream] 📍 Mark event received:`, data.mark);
      } else if (data.event === 'error') {
        console.error(`[Media Stream] ❌ ERROR from Twilio:`, data);
      } else {
        console.log(`[Media Stream] 📨 Unknown event type:`, data);
      }
    } catch (error) {
      console.error(`[Media Stream] Error processing message: ${error.message}`);
      console.error(`[Media Stream] Raw message:`, message.toString().substring(0, 200));
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

  // NOTE: Do NOT send a "connected" message to Twilio
  // Twilio sends US a "connected" event - we only respond to their events
  // Sending a "connected" message back causes "Protocol - Invalid message" errors
});

/**
 * Process accumulated audio chunk for speech-to-text
 */
async function processAudioChunk(connection) {
  if (connection.audioBuffer.length === 0) return;

  try {
    console.log(`[Media Stream] 🎤 Processing audio chunk: ${connection.audioBuffer.length} bytes`);
    
    // Send audio to Next.js API for speech-to-text processing
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
      console.log(`[Media Stream] 📝 STT result: "${result.text || '(empty)'}"`);
      
      if (result.text && result.text.trim().length > 0) {
        console.log(`[Media Stream] ✅ Got transcription: "${result.text}"`);
        // Process the transcribed text through agent executor
        await processUserInput(connection, result.text);
      } else {
        console.log(`[Media Stream] ⚠️  Empty transcription - user might not have spoken yet`);
      }
    } else {
      const errorText = await response.text();
      console.error(`[Media Stream] ❌ STT API error: ${response.status} ${errorText}`);
    }

    // Clear buffer after processing
    connection.audioBuffer = Buffer.alloc(0);
  } catch (error) {
    console.error(`[Media Stream] ❌ Error processing audio: ${error.message}`);
    console.error(`[Media Stream] Error stack:`, error.stack);
  }
}

/**
 * Send initial greeting when stream starts
 */
async function sendInitialGreeting(connection) {
  const startTime = Date.now();
  try {
    if (!connection.conversationId) {
      console.warn(`[Media Stream] No conversationId, skipping greeting`);
      return;
    }

    console.log(`[Media Stream] Sending initial greeting for conversation: ${connection.conversationId}`);

    // Call Next.js API to get the greeting (empty input triggers greeting)
    const apiStartTime = Date.now();
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

    const apiEndTime = Date.now();
    console.log(`[Media Stream] ⏱️  Greeting API call took ${apiEndTime - apiStartTime}ms`);

    if (response.ok) {
      const result = await response.json();
      if (result.output && result.output.trim().length > 0) {
        const ttsStartTime = Date.now();
        await streamAudioResponse(connection, result.output, result.voiceId);
        const ttsEndTime = Date.now();
        console.log(`[Media Stream] ⏱️  Greeting TTS took ${ttsEndTime - ttsStartTime}ms`);
        
        const totalTime = Date.now() - startTime;
        console.log(`[Media Stream] ⏱️  Total greeting time: ${totalTime}ms`);
      } else {
        console.warn(`[Media Stream] Greeting API ok but no output`);
      }
    } else {
      const errBody = await response.text();
      console.error(`[Media Stream] Failed to get greeting: ${response.status} ${errBody}`);
    }
  } catch (error) {
    console.error(`[Media Stream] Error sending initial greeting: ${error.message}`);
  }
}

/**
 * Process user input through agent executor
 */
async function processUserInput(connection, userInput) {
  const startTime = Date.now();
  try {
    console.log(`[Media Stream] Processing user input: "${userInput}"`);

    // Call Next.js API to execute agent step
    const apiStartTime = Date.now();
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

    const apiEndTime = Date.now();
    console.log(`[Media Stream] ⏱️  API call took ${apiEndTime - apiStartTime}ms`);

    if (response.ok) {
      const result = await response.json();
      
      if (result.output && result.output.trim().length > 0) {
        const ttsStartTime = Date.now();
        // Convert text to speech and stream back
        await streamAudioResponse(connection, result.output, result.voiceId);
        const ttsEndTime = Date.now();
        console.log(`[Media Stream] ⏱️  TTS generation took ${ttsEndTime - ttsStartTime}ms`);
        
        const totalTime = Date.now() - startTime;
        console.log(`[Media Stream] ⏱️  Total processing time: ${totalTime}ms`);
      }
    } else {
      const errorText = await response.text();
      console.error(`[Media Stream] API error: ${response.status} ${errorText}`);
    }
  } catch (error) {
    console.error(`[Media Stream] Error processing user input: ${error.message}`);
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
  
  // Downsample 16kHz -> 8kHz using averaging (better quality than taking every other sample)
  const pcm8k = new Int16Array(Math.floor(numSamples / 2));
  for (let i = 0; i < pcm8k.length; i++) {
    // Average two consecutive samples to reduce aliasing
    const sample1 = pcm16[i * 2];
    const sample2 = pcm16[i * 2 + 1] || sample1; // Use same sample if odd length
    pcm8k[i] = Math.round((sample1 + sample2) / 2);
  }
  
  // Encode to mulaw (returns Uint8Array)
  const mulawSamples = alawmulaw.mulaw.encode(pcm8k);
  return Buffer.from(mulawSamples);
}

/**
 * Convert text to speech and stream audio back to Twilio.
 * Twilio Media Streams require mulaw 8kHz base64 — we request PCM 16kHz from ElevenLabs,
 * then downsample and encode to mulaw.
 */
async function streamAudioResponse(connection, text, voiceId) {
  try {
    const effectiveVoiceId = voiceId || DEFAULT_VOICE_ID;
    console.log(`[Media Stream] 🎤 Starting TTS for text: "${text.substring(0, 50)}..." with voice: ${effectiveVoiceId}`);
    
    if (!ELEVENLABS_API_KEY) {
      console.error('[Media Stream] ❌ CRITICAL: No ElevenLabs API key found! Check Railway environment variables.');
      console.error('[Media Stream] ELEVENLABS_API_KEY is:', ELEVENLABS_API_KEY ? 'SET (but might be empty)' : 'NOT SET');
      return;
    }

    console.log(`[Media Stream] 📞 Calling ElevenLabs API for voice ${effectiveVoiceId}...`);
    const ttsStartTime = Date.now();
    
    // Try to get PCM format - use explicit format parameter
    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${effectiveVoiceId}?output_format=pcm_16000`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/pcm', // Request PCM format
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.15, similarity_boost: 0.4 },
          output_format: 'pcm_16000', // PCM 16kHz - we'll convert to mulaw 8kHz
        }),
      }
    );

    const ttsApiTime = Date.now() - ttsStartTime;
    const contentType = ttsResponse.headers.get('content-type') || 'unknown';
    console.log(`[Media Stream] ⏱️  ElevenLabs API call took ${ttsApiTime}ms, status: ${ttsResponse.status}, content-type: ${contentType}`);

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      console.error('[Media Stream] ❌ ElevenLabs TTS error:', {
        status: ttsResponse.status,
        statusText: ttsResponse.statusText,
        error: errorText,
        voiceId: effectiveVoiceId,
        textLength: text.length,
      });
      return;
    }

    console.log(`[Media Stream] ✅ ElevenLabs response OK, processing audio...`);
    const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
    
    // Check if we got MP3 instead of PCM (ElevenLabs sometimes returns MP3 even when requesting PCM)
    if (contentType.includes('mpeg') || contentType.includes('mp3')) {
      console.error(`[Media Stream] ❌ CRITICAL ERROR: ElevenLabs returned MP3 (${contentType}) instead of PCM!`);
      console.error(`[Media Stream] ❌ This causes screeching noise. ElevenLabs API is not respecting output_format='pcm_16000'`);
      console.error(`[Media Stream] ❌ Attempting workaround: Requesting raw PCM without format parameter...`);
      
      // Try again with a different approach - request raw PCM
      const retryResponse = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${effectiveVoiceId}`,
        {
          method: 'POST',
          headers: {
            'Accept': 'audio/pcm;rate=16000', // More explicit PCM request
            'Content-Type': 'application/json',
            'xi-api-key': ELEVENLABS_API_KEY,
          },
          body: JSON.stringify({
            text: text.trim(),
            model_id: 'eleven_turbo_v2_5',
            voice_settings: { stability: 0.15, similarity_boost: 0.4 },
            // Don't specify output_format - let Accept header handle it
          }),
        }
      );
      
      const retryContentType = retryResponse.headers.get('content-type') || 'unknown';
      console.log(`[Media Stream] Retry content-type: ${retryContentType}`);
      
      if (retryContentType.includes('mpeg') || retryContentType.includes('mp3')) {
        console.error(`[Media Stream] ❌ Retry also returned MP3. ElevenLabs API issue.`);
        console.error(`[Media Stream] ❌ Cannot proceed - MP3 cannot be converted to mulaw without decoding.`);
        return;
      }
      
      // Use retry response
      const retryBuffer = Buffer.from(await retryResponse.arrayBuffer());
      console.log(`[Media Stream] 📦 Retry audio buffer size: ${retryBuffer.length} bytes (PCM 16kHz from ElevenLabs)`);
      const mulaw8k = pcm16kToMulaw8k(retryBuffer);
      console.log(`[Media Stream] 🔄 Converted to mulaw 8kHz: ${mulaw8k.length} bytes`);
      
      // Continue with mulaw8k from retry
      const chunkSize = 800;
      const totalChunks = Math.ceil(mulaw8k.length / chunkSize);
      let chunksSent = 0;
      
      console.log(`[Media Stream] 📤 Streaming ${totalChunks} audio chunks to Twilio at real-time rate (${(totalChunks * 0.1).toFixed(1)}s of audio)...`);
      
      for (let i = 0; i < mulaw8k.length; i += chunkSize) {
        const chunk = mulaw8k.slice(i, i + chunkSize);
        const chunkIndex = Math.floor(i / chunkSize);
        
        setTimeout(() => {
          if (connection.ws.readyState === WebSocket.OPEN && connection.streamSid) {
            const base64Chunk = chunk.toString('base64');
            const mediaMessage = {
              event: 'media',
              streamSid: connection.streamSid,
              media: { payload: base64Chunk },
            };
            try {
              connection.ws.send(JSON.stringify(mediaMessage));
              chunksSent++;
              if (chunksSent === totalChunks) {
                console.log(`[Media Stream] ✅ Successfully streamed all ${chunksSent} audio chunks`);
              }
            } catch (sendError) {
              console.error(`[Media Stream] ❌ Error sending chunk ${chunkIndex}:`, sendError.message);
            }
          }
        }, chunkIndex * 100);
      }
      return; // Exit early
    }
    
    // Normal PCM path
    console.log(`[Media Stream] 📦 Audio buffer size: ${audioBuffer.length} bytes (PCM 16kHz from ElevenLabs)`);
    
    // Convert PCM 16kHz to mulaw 8kHz for Twilio
    const mulaw8k = pcm16kToMulaw8k(audioBuffer);
    console.log(`[Media Stream] 🔄 Converted to mulaw 8kHz: ${mulaw8k.length} bytes`);

    // Twilio expects mulaw 8kHz; 100ms = 800 bytes
    // CRITICAL: Send chunks at REAL-TIME rate (100ms per chunk) for Twilio to play them correctly
    const chunkSize = 800;
    const totalChunks = Math.ceil(mulaw8k.length / chunkSize);
    let chunksSent = 0;
    
    console.log(`[Media Stream] 📤 Streaming ${totalChunks} audio chunks to Twilio at real-time rate (${(totalChunks * 0.1).toFixed(1)}s of audio)...`);
    
    // Send chunks at real-time rate (100ms per chunk = 800 bytes per 100ms)
    // This matches Twilio's expected playback rate
    for (let i = 0; i < mulaw8k.length; i += chunkSize) {
      const chunk = mulaw8k.slice(i, i + chunkSize);
      const chunkIndex = Math.floor(i / chunkSize);
      
      setTimeout(() => {
        if (connection.ws.readyState === WebSocket.OPEN) {
          // Validate streamSid before sending
          if (!connection.streamSid) {
            console.error(`[Media Stream] ❌ Cannot send chunk ${chunkIndex}: streamSid is missing!`);
            return;
          }
          
          const base64Chunk = chunk.toString('base64');
          const mediaMessage = {
            event: 'media',
            streamSid: connection.streamSid,
            media: { 
              payload: base64Chunk 
            },
          };
          
          // Send as JSON string
          const message = JSON.stringify(mediaMessage);
          
          try {
            connection.ws.send(message);
            chunksSent++;
          } catch (sendError) {
            console.error(`[Media Stream] ❌ Error sending chunk ${chunkIndex}:`, sendError.message);
            return; // Stop sending if there's an error
          }
          
          // Log first chunk for debugging
          if (chunksSent === 1) {
            console.log(`[Media Stream] 📤 First chunk sent at real-time rate`);
            console.log(`[Media Stream] 📤 Message format: ${message.substring(0, 150)}...`);
          }
          
          // Log progress every 10 chunks
          if (chunksSent % 10 === 0) {
            console.log(`[Media Stream] 📤 Sent ${chunksSent}/${totalChunks} chunks (${(chunksSent * 0.1).toFixed(1)}s)`);
          }
          
          // Log when all chunks are sent
          if (chunksSent === totalChunks) {
            console.log(`[Media Stream] ✅ Successfully streamed all ${chunksSent} audio chunks to Twilio`);
            console.log(`[Media Stream] 📊 Total audio duration: ~${(totalChunks * 0.1).toFixed(1)}s`);
          }
        } else {
          console.warn(`[Media Stream] ⚠️  WebSocket not open (state: ${connection.ws.readyState}), cannot send chunk ${chunkIndex}`);
        }
      }, chunkIndex * 100); // 100ms delay = real-time playback rate
    }
    
    console.log(`[Media Stream] 📤 Queued ${totalChunks} audio chunks for real-time streaming (will complete in ~${(totalChunks * 0.1).toFixed(1)}s)`);
  } catch (error) {
    console.error(`[Media Stream] ❌ Error streaming audio:`, {
      error: error.message,
      stack: error.stack,
      voiceId: voiceId || DEFAULT_VOICE_ID,
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
    if (connection.processTimer) {
      clearTimeout(connection.processTimer);
    }
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
  console.log(`[Media Stream] ==========================================`);
  console.log(`[Media Stream] 🚀 Server Version: 44da9ec (Fixed protocol error)`);
  console.log(`[Media Stream] ✅ FIXED: Removed invalid 'connected' message to Twilio`);
  console.log(`[Media Stream] ==========================================`);
  console.log(`[Media Stream] WebSocket server listening on port ${PORT}`);
  console.log(`[Media Stream] Next.js API URL: ${NEXTJS_API_URL}`);
  console.log(`[Media Stream] Server bound to 0.0.0.0 (accepting external connections)`);
  console.log(`[Media Stream] ✅ Server started successfully - ready for connections`);
});

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

// Handle WebSocket server errors
wss.on('error', (error) => {
  console.error(`[Media Stream] ❌ WebSocket server error:`, error.message);
  console.error(`[Media Stream] Error stack:`, error.stack);
});

// Handle upgrade errors
wss.on('headers', (headers, request) => {
  console.log(`[Media Stream] 📋 WebSocket upgrade headers for: ${request.url}`);
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
    isSpeaking: false, // Track if agent is currently speaking
    isEndingCall: false, // Track if we're in the process of ending the call
    stopTTS: false, // Flag to stop current TTS when user interrupts
    greetingStartTime: 0, // Track when greeting started
    consecutiveSilences: 0, // Track consecutive empty transcriptions with low RMS
    lastUserSpeechTime: 0, // Track when user last spoke (non-empty transcription)
    lastAgentSpeechEndTime: 0, // Track when agent last finished speaking (for grace period)
    pendingUserInput: [], // Accumulate user inputs during debounce period
    inputDebounceTimer: null, // Timer for debouncing user input (500ms after last speech)
    currentTTSChunks: [], // Track current TTS chunks for interruption
    pendingSTTCall: false, // Track if we have a pending STT API call
    recentTranscriptions: [], // Track recent transcriptions to prevent duplicates (last 5, with timestamps)
    isProcessingInput: false, // Track if we're currently processing user input (prevent concurrent processing)
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
        
        // Skip processing if agent is currently speaking (to avoid processing agent's own voice)
        if (connection.isSpeaking) {
          // Don't process audio while agent is speaking
          return;
        }
        
        // Wait at least 3 seconds after greeting starts before processing user audio
        const timeSinceGreeting = connection.greetingStartTime > 0 ? Date.now() - connection.greetingStartTime : Infinity;
        if (timeSinceGreeting < 3000) {
          // Still too soon after greeting, skip processing
          return;
        }
        
        // Process audio chunks - Whisper works better with longer audio (3-4 seconds)
        // 24000 bytes = ~3 seconds of mulaw 8kHz audio (better for Whisper accuracy)
        // Also process if we haven't processed in 4 seconds (catches short utterances)
        const timeSinceLastProcess = Date.now() - connection.lastProcessTime;
        const shouldProcess = connection.audioBuffer.length > 24000 || (timeSinceLastProcess > 4000 && connection.audioBuffer.length > 16000);
        
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
  
  // CRITICAL: Don't process audio if we're already ending the call
  if (connection.isEndingCall) {
    console.log(`[Media Stream] ⚠️  Call is ending, ignoring audio chunk (${connection.audioBuffer.length} bytes)`);
    connection.audioBuffer = Buffer.alloc(0); // Clear buffer
    return;
  }

  // Make a copy of the buffer and clear it immediately to prevent concurrent processing
  const audioToProcess = Buffer.from(connection.audioBuffer);
  connection.audioBuffer = Buffer.alloc(0);

  try {
    const apiStartTime = Date.now();
    console.log(`[Media Stream] 🎤 Processing audio chunk: ${audioToProcess.length} bytes`);
    
    // If audio buffer is substantial (indicating actual speech, not silence), update lastUserSpeechTime
    // This prevents silence detection from triggering while STT is processing
    if (audioToProcess.length > 10000) { // More than ~1.25 seconds of audio at 8kHz
      connection.lastUserSpeechTime = Date.now();
      console.log(`[Media Stream] 📝 Updating lastUserSpeechTime - substantial audio detected (${audioToProcess.length} bytes)`);
    }
    
    // Mark that we have a pending STT call
    connection.pendingSTTCall = true;
    
    // Send audio to Next.js API for speech-to-text processing
    const response = await fetch(`${NEXTJS_API_URL}/api/twilio/media-stream-process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        callSid: connection.callSid,
        conversationId: connection.conversationId,
        audioBase64: audioToProcess.toString('base64'),
      }),
    });

    const apiEndTime = Date.now();
    console.log(`[Media Stream] ⏱️  STT API call took ${apiEndTime - apiStartTime}ms`);
    
    if (response.ok) {
      const result = await response.json();
      console.log(`[Media Stream] 📝 STT result: "${result.text || '(empty)'}"`);
      
      // Log debug info if available
      if (result.debug) {
        console.log(`[Media Stream] 🔍 Debug info: RMS=${result.debug.rms}, threshold=${result.debug.threshold}, length=${result.debug.audioLength}`);
      } else {
        console.log(`[Media Stream] ⚠️  No debug info in response`);
      }
      
      if (result.text && result.text.trim().length > 0) {
        const rmsValue = result.debug?.rms ? parseFloat(result.debug.rms) : 0;
        const transcription = result.text.trim();
        
        // Filter out false positives: very short transcriptions that are likely noise
        // These are likely the agent's own voice or background noise being mis-transcribed
        const isVeryShort = transcription.split(/\s+/).length <= 2; // 1-2 words
        const isCommonFalsePositive = /^(you|for|\.|\.\s*\.|yes|no|ok|okay|uh|um|ah|for\.)$/i.test(transcription);
        
        // For known false positive words, filter them if they're very short AND either:
        // 1. Low RMS (< 100) - definitely noise, OR
        // 2. Medium RMS (< 500) - could be agent's voice bleeding through
        // This catches cases like "for." with RMS=358 which should be filtered
        const shouldFilterFalsePositive = isVeryShort && isCommonFalsePositive && rmsValue < 500;
        
        if (shouldFilterFalsePositive) {
          console.log(`[Media Stream] ⚠️  Ignoring likely false positive: "${transcription}" (RMS: ${rmsValue.toFixed(2)}, too short/suspicious)`);
          // Treat as silence for silence detection, but only if agent is not speaking
          // AND enough time has passed since agent finished speaking (grace period)
          if (!connection.isSpeaking) {
            const timeSinceAgentFinished = Date.now() - connection.lastAgentSpeechEndTime;
            const gracePeriod = 5000; // 5 seconds grace period after agent finishes speaking
            
            if (timeSinceAgentFinished > gracePeriod) {
              // Don't trigger silence detection if we have a pending STT call (user might be speaking)
              if (connection.pendingSTTCall) {
                console.log(`[Media Stream] 🔇 Skipping silence detection - STT call in progress`);
                return;
              }
              
              // Check if 20 seconds have passed since last user speech (or greeting start if no speech yet)
              const silenceTimeout = 20000; // 20 seconds
              const timeSinceLastUserSpeech = connection.lastUserSpeechTime > 0 
                ? Date.now() - connection.lastUserSpeechTime 
                : Date.now() - connection.greetingStartTime;
              
              if (timeSinceLastUserSpeech >= silenceTimeout) {
                // Double-check: Make absolutely sure agent is not speaking and we're not already ending the call
                if (connection.isSpeaking || connection.isEndingCall) {
                  console.log(`[Media Stream] 🔇 Silence timeout reached but agent is speaking or call is ending - skipping end call`);
                  return;
                }
                console.log(`[Media Stream] 🔇 No user speech detected for ${(timeSinceLastUserSpeech / 1000).toFixed(1)}s. Ending call.`);
                await endCallWithMessage(connection, "You have not spoken. This call will end.");
                return;
              }
            } else {
              console.log(`[Media Stream] 🔇 Skipping silence detection - within grace period (${(gracePeriod - timeSinceAgentFinished) / 1000}s remaining)`);
            }
          }
          return; // Don't process this transcription
        }
        
        console.log(`[Media Stream] ✅ Got transcription: "${transcription}"`);
        
        // CRITICAL: As soon as user starts speaking, clear ALL pending state
        // This ensures we start fresh with the new user input
        console.log(`[Media Stream] 🧹 User started speaking - clearing all pending state`);
        
        // Stop any ongoing TTS immediately
        if (connection.isSpeaking) {
          console.log(`[Media Stream] 🛑 User interrupting agent - stopping current TTS`);
          stopCurrentTTS(connection);
        }
        
        // Note: If input is currently being processed, we can't cancel it mid-way,
        // but we've cleared pendingUserInput so it won't process any new input.
        // The isProcessingInput flag will be reset when the current processing finishes.
        if (connection.isProcessingInput) {
          console.log(`[Media Stream] ⚠️  Input processing in progress - will complete current processing, but new input will start fresh`);
        }
        
        // Clear all pending user input (old transcriptions that haven't been processed yet)
        if (connection.pendingUserInput.length > 0) {
          console.log(`[Media Stream] 🧹 Clearing ${connection.pendingUserInput.length} pending user inputs`);
          connection.pendingUserInput = [];
        }
        
        // Cancel any pending debounce timer
        if (connection.inputDebounceTimer) {
          console.log(`[Media Stream] 🧹 Cancelling pending debounce timer`);
          clearTimeout(connection.inputDebounceTimer);
          connection.inputDebounceTimer = null;
        }
        
        // Reset silence counter on successful transcription
        connection.consecutiveSilences = 0;
        connection.lastUserSpeechTime = Date.now();
        
        // Start fresh: add only the new transcription
        connection.pendingUserInput.push(transcription);
        console.log(`[Media Stream] 📝 Starting fresh with new transcription: "${transcription}"`);
        
        // Set new debounce timer - process after 500ms of silence
        connection.inputDebounceTimer = setTimeout(async () => {
          // CRITICAL: Don't process any input if we're already ending the call
          if (connection.isEndingCall) {
            console.log(`[Media Stream] ⚠️  Call is ending, clearing pending input (${connection.pendingUserInput.length} items)`);
            connection.pendingUserInput = [];
            connection.inputDebounceTimer = null;
            return;
          }
          
          if (connection.pendingUserInput.length > 0) {
            // Combine all accumulated inputs
            const combinedInput = connection.pendingUserInput.join(' ');
            console.log(`[Media Stream] 📝 Processing accumulated input (${connection.pendingUserInput.length} parts): "${combinedInput}"`);
            connection.pendingUserInput = []; // Clear accumulated inputs
            connection.inputDebounceTimer = null;
            
            // Check if this combined input was recently processed (prevent duplicate processing)
            const normalizedCombined = combinedInput.trim().toLowerCase();
            const now = Date.now();
            const duplicateWindow = 10000; // 10 seconds (increased from 3 to catch more duplicates)
            const isDuplicate = connection.recentTranscriptions.some(entry => {
              const timeDiff = now - entry.timestamp;
              if (timeDiff > duplicateWindow) return false; // Too old, ignore
              const normalizedRecent = entry.text.trim().toLowerCase();
              // Check if combined input is very similar to a recently processed input
              return normalizedCombined === normalizedRecent || 
                     normalizedCombined.includes(normalizedRecent) || 
                     normalizedRecent.includes(normalizedCombined);
            });
            
            if (isDuplicate) {
              console.log(`[Media Stream] ⚠️  Ignoring duplicate combined input: "${combinedInput}" (similar to recently processed input)`);
              return; // Don't process this duplicate
            }
            
            // Check if we're already processing input (prevent concurrent processing)
            if (connection.isProcessingInput) {
              console.log(`[Media Stream] ⚠️  Already processing input, skipping duplicate processing`);
              return; // Don't process concurrently
            }
            
            // Track this combined input to prevent future duplicates
            connection.recentTranscriptions.push({ text: combinedInput, timestamp: now });
            // Keep only last 5 transcriptions
            if (connection.recentTranscriptions.length > 5) {
              connection.recentTranscriptions.shift();
            }
            
            connection.isProcessingInput = true;
            try {
              await processUserInput(connection, combinedInput);
            } finally {
              connection.isProcessingInput = false;
            }
          }
        }, 500);
      } else {
        // Don't check for silence while agent is speaking (to avoid false positives)
        if (connection.isSpeaking) {
          console.log(`[Media Stream] 🔇 Skipping silence detection - agent is currently speaking`);
          return;
        }
        
        // Check grace period: don't count silences immediately after agent finishes speaking
        const timeSinceAgentFinished = Date.now() - connection.lastAgentSpeechEndTime;
        const gracePeriod = 5000; // 5 seconds grace period after agent finishes speaking
        
        if (timeSinceAgentFinished < gracePeriod) {
          console.log(`[Media Stream] 🔇 Skipping silence detection - within grace period (${((gracePeriod - timeSinceAgentFinished) / 1000).toFixed(1)}s remaining)`);
          return;
        }
        
        // Check if this is actual silence (low RMS) or a transcription failure (high RMS)
        const rmsValue = result.debug?.rms ? parseFloat(result.debug.rms) : 0;
        const isActualSilence = rmsValue < 50; // Low RMS = actual silence
        
        if (isActualSilence) {
          console.log(`[Media Stream] ⚠️  Empty transcription - actual silence detected (RMS: ${rmsValue.toFixed(2)})`);
          
          // Don't trigger silence detection if we have a pending STT call (user might be speaking)
          if (connection.pendingSTTCall) {
            console.log(`[Media Stream] 🔇 Skipping silence detection - STT call in progress`);
            return;
          }
          
          // Check if 20 seconds have passed since last user speech (or greeting start if no speech yet)
          const silenceTimeout = 20000; // 20 seconds
          const timeSinceLastUserSpeech = connection.lastUserSpeechTime > 0 
            ? Date.now() - connection.lastUserSpeechTime 
            : Date.now() - connection.greetingStartTime;
          
          if (timeSinceLastUserSpeech >= silenceTimeout) {
            // Double-check: Make absolutely sure agent is not speaking, we're not already ending the call,
            // and there's no pending user input or processing in progress
            if (connection.isSpeaking || connection.isEndingCall) {
              console.log(`[Media Stream] 🔇 Silence timeout reached but agent is speaking or call is ending - skipping end call`);
              return;
            }
            
            // Don't end call if there's pending user input waiting to be processed
            if (connection.pendingUserInput.length > 0 || connection.inputDebounceTimer) {
              console.log(`[Media Stream] 🔇 Silence timeout reached but user input is pending - skipping end call`);
              return;
            }
            
            // Don't end call if input is currently being processed
            if (connection.isProcessingInput || connection.pendingSTTCall) {
              console.log(`[Media Stream] 🔇 Silence timeout reached but input is being processed - skipping end call`);
              return;
            }
            
            console.log(`[Media Stream] 🔇 No user speech detected for ${(timeSinceLastUserSpeech / 1000).toFixed(1)}s. Ending call.`);
            await endCallWithMessage(connection, "You have not spoken. This call will end.");
            return;
          }
        } else {
          // High RMS but empty transcription = transcription failure, not silence
          console.log(`[Media Stream] ⚠️  Empty transcription despite high RMS (${rmsValue.toFixed(2)}) - transcription may have failed`);
          // Don't increment silence counter for transcription failures
        }
        
        if (result.debug) {
          console.log(`[Media Stream] 🔍 Audio RMS was ${result.debug.rms}, threshold is ${result.debug.threshold}`);
        }
      }
    } else {
      const errorText = await response.text();
      console.error(`[Media Stream] ❌ STT API error: ${response.status} ${errorText}`);
    }
    
    // Reset pending STT call flag after processing (success or error)
    connection.pendingSTTCall = false;
  } catch (error) {
    console.error(`[Media Stream] ❌ Error processing audio: ${error.message}`);
    console.error(`[Media Stream] Error stack:`, error.stack);
    // Reset pending STT call flag on error
    connection.pendingSTTCall = false;
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

    connection.isSpeaking = true;
    connection.greetingStartTime = Date.now();
    connection.consecutiveSilences = 0; // Reset silence counter when greeting starts
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
 * Stop current TTS streaming when user interrupts
 */
function stopCurrentTTS(connection) {
  // Clear any pending TTS chunks
  connection.currentTTSChunks = [];
  
  // Set flag to stop sending chunks (will be checked in streamAudioResponse)
  connection.stopTTS = true;
  
  // Reset speaking flag immediately so we can process new input
  connection.isSpeaking = false;
  
  console.log(`[Media Stream] 🛑 Stopped current TTS - ready for user input`);
}

/**
 * Process user input through agent executor
 */
async function processUserInput(connection, userInput) {
  const startTime = Date.now();
  try {
    // CRITICAL: Don't process any input if we're already ending the call
    if (connection.isEndingCall) {
      console.log(`[Media Stream] ⚠️  Call is ending, ignoring user input: "${userInput}"`);
      return;
    }
    
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
          // If we were in the process of ending the call, cancel it since agent is responding
          if (connection.isEndingCall) {
            console.log(`[Media Stream] ✅ Agent is responding - cancelling end call`);
            connection.isEndingCall = false;
          }
          
          // Double-check: if agent is already speaking, don't start another TTS (prevent overlapping)
          if (connection.isSpeaking) {
            console.log(`[Media Stream] ⚠️  Agent is already speaking, skipping duplicate TTS for: "${result.output.substring(0, 50)}..."`);
            return; // Don't start overlapping TTS
          }
          
          // If agent was speaking, it was already stopped by stopCurrentTTS in the transcription handler
          // Now we can start the new TTS
          connection.isSpeaking = true; // Agent is about to speak
          connection.consecutiveSilences = 0; // Reset silence counter when agent starts speaking
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
    // Reset stop flag when starting new TTS
    connection.stopTTS = false;
    
    const effectiveVoiceId = voiceId || DEFAULT_VOICE_ID;
    const textToSpeak = text.trim();
    
    // Log the FULL text being converted to speech (not truncated)
    console.log(`[Media Stream] 🎤 Starting TTS for text (FULL): "${textToSpeak}"`);
    console.log(`[Media Stream] 🎤 TTS text length: ${textToSpeak.length} characters, voice: ${effectiveVoiceId}`);
    
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
          text: textToSpeak,
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
          // Check if TTS was interrupted - stop sending chunks
          if (connection.stopTTS) {
            console.log(`[Media Stream] 🛑 TTS interrupted - stopping chunk ${chunkIndex}`);
            return;
          }
          
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
              if (chunksSent === totalChunks || connection.stopTTS) {
                if (connection.stopTTS) {
                  console.log(`[Media Stream] 🛑 TTS interrupted after ${chunksSent}/${totalChunks} chunks`);
                  console.log(`[Media Stream] 🛑 Interrupted text was: "${textToSpeak}"`);
                  connection.stopTTS = false;
                  connection.isSpeaking = false;
                  connection.lastAgentSpeechEndTime = Date.now();
                  connection.consecutiveSilences = 0;
                  console.log(`[Media Stream] 🎤 Agent interrupted, ready for user input`);
                } else {
                  console.log(`[Media Stream] ✅ Successfully streamed all ${chunksSent} audio chunks`);
                  console.log(`[Media Stream] 🔊 Agent just finished speaking this text: "${textToSpeak}"`);
                  // Wait buffer then reset speaking state
                  setTimeout(() => {
                    connection.isSpeaking = false;
                    connection.lastAgentSpeechEndTime = Date.now();
                    connection.consecutiveSilences = 0;
                    console.log(`[Media Stream] 🎤 Agent finished speaking, ready for user input`);
                  }, 500);
                }
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
        // Check if TTS was interrupted - stop sending chunks
        if (connection.stopTTS) {
          console.log(`[Media Stream] 🛑 TTS interrupted - stopping chunk ${chunkIndex}`);
          return;
        }
        
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
          
          // Log when all chunks are sent (or if interrupted)
          if (chunksSent === totalChunks || connection.stopTTS) {
            if (connection.stopTTS) {
              console.log(`[Media Stream] 🛑 TTS interrupted after ${chunksSent}/${totalChunks} chunks`);
              console.log(`[Media Stream] 🛑 Interrupted text was: "${textToSpeak}"`);
              connection.stopTTS = false; // Reset flag
              // Immediately reset speaking state for interruption
              connection.isSpeaking = false;
              connection.lastAgentSpeechEndTime = Date.now();
              connection.consecutiveSilences = 0;
              console.log(`[Media Stream] 🎤 Agent interrupted, ready for user input`);
            } else {
              console.log(`[Media Stream] ✅ Successfully streamed all ${chunksSent} audio chunks to Twilio`);
              console.log(`[Media Stream] 📊 Total audio duration: ~${(totalChunks * 0.1).toFixed(1)}s`);
              console.log(`[Media Stream] 🔊 Agent just finished speaking this text: "${textToSpeak}"`);
              
              // Wait a small buffer (500ms) to ensure audio has finished playing before allowing new TTS
              // This prevents overlapping audio from concurrent TTS calls
              setTimeout(() => {
                connection.isSpeaking = false; // Agent finished speaking
                connection.lastAgentSpeechEndTime = Date.now(); // Track when agent finished
                connection.consecutiveSilences = 0; // Reset silence counter after agent speaks
                console.log(`[Media Stream] 🎤 Agent finished speaking, ready for user input (silence counter reset)`);
              }, 500);
            }
          }
        } else {
          console.warn(`[Media Stream] ⚠️  WebSocket not open (state: ${connection.ws.readyState}), cannot send chunk ${chunkIndex}`);
        }
      }, chunkIndex * 100); // 100ms delay = real-time playback rate
    }
    
    console.log(`[Media Stream] 📤 Queued ${totalChunks} audio chunks for real-time streaming (will complete in ~${(totalChunks * 0.1).toFixed(1)}s)`);
    
    // Safety timeout: Reset isSpeaking flag after expected completion time + buffer
    // This ensures the flag is reset even if the chunk sending logic fails
    const expectedCompletionTime = totalChunks * 100 + 1000; // chunks * 100ms + 1s buffer
    setTimeout(() => {
      if (connection.isSpeaking) {
        console.warn(`[Media Stream] ⚠️  Safety timeout: Resetting isSpeaking flag after ${expectedCompletionTime}ms`);
        connection.isSpeaking = false;
      }
    }, expectedCompletionTime);
  } catch (error) {
    console.error(`[Media Stream] ❌ Error streaming audio:`, {
      error: error.message,
      stack: error.stack,
      voiceId: voiceId || DEFAULT_VOICE_ID,
    });
    // Ensure flag is reset on error
    connection.isSpeaking = false;
    console.log(`[Media Stream] 🔄 Reset isSpeaking flag due to error`);
  }
}

/**
 * End call with a message and close connection
 */
async function endCallWithMessage(connection, message) {
  try {
    // Prevent multiple simultaneous calls to endCallWithMessage
    if (connection.isEndingCall) {
      console.log(`[Media Stream] ⚠️  Call is already being ended, skipping duplicate call`);
      return;
    }
    
    console.log(`[Media Stream] 🛑 Ending call with message: "${message}"`);
    
    // Check if agent is already speaking - if so, skip ending the call entirely
    // Don't interrupt the agent's response
    if (connection.isSpeaking) {
      console.log(`[Media Stream] ⚠️  Agent is already speaking, skipping end call to avoid interrupting response`);
      return;
    }
    
    // CRITICAL: Set flag IMMEDIATELY to prevent any further processing
    // This must be set before any async operations to prevent race conditions
    connection.isEndingCall = true;
    
    // Clear any pending user input - we're ending the call, don't process it
    if (connection.pendingUserInput.length > 0) {
      console.log(`[Media Stream] 🛑 Clearing ${connection.pendingUserInput.length} pending user inputs - call is ending`);
      connection.pendingUserInput = [];
    }
    
    // Clear any pending debounce timer
    if (connection.inputDebounceTimer) {
      clearTimeout(connection.inputDebounceTimer);
      connection.inputDebounceTimer = null;
      console.log(`[Media Stream] 🛑 Cleared input debounce timer - call is ending`);
    }
    
    // Send the message via TTS first
    connection.isSpeaking = true;
    await streamAudioResponse(connection, message, null);
    
    // Wait a moment for the message to finish
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Close the WebSocket connection (this will end the Media Stream)
    if (connection.ws && connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.close();
      console.log(`[Media Stream] ✅ Closed WebSocket connection`);
    }
    
    // Cleanup the connection
    cleanupConnection(connection.id);
  } catch (error) {
    console.error(`[Media Stream] ❌ Error ending call:`, error.message);
    // Still cleanup on error
    cleanupConnection(connection.id);
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
    if (connection.inputDebounceTimer) {
      clearTimeout(connection.inputDebounceTimer);
      connection.inputDebounceTimer = null;
    }
    activeConnections.delete(connectionId);
    console.log(`[Media Stream] Cleaned up connection: ${connectionId}`);
  }
}

// Note: We don't need a custom upgrade handler - the WebSocket.Server handles upgrades automatically
// Adding one would interfere with the WebSocket upgrade process
// The 'connection' event on wss will fire when upgrades succeed

// Start server - bind to 0.0.0.0 to accept connections from Railway's reverse proxy
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Media Stream] ==========================================`);
  console.log(`[Media Stream] 🚀 Server Version: clear-pending-on-user-speech`);
  console.log(`[Media Stream] ✅ FIXED: Clear all pending input/TTS when user starts speaking`);
  console.log(`[Media Stream] ✅ User speech now immediately clears pending state and starts fresh`);
  console.log(`[Media Stream] ==========================================`);
  console.log(`[Media Stream] WebSocket server listening on port ${PORT}`);
  console.log(`[Media Stream] Next.js API URL: ${NEXTJS_API_URL}`);
  console.log(`[Media Stream] Server bound to 0.0.0.0 (accepting external connections)`);
  console.log(`[Media Stream] ✅ Server started successfully - ready for connections`);
});

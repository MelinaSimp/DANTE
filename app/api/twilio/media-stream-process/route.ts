/**
 * Process audio from Media Streams
 * Called by the WebSocket server to process audio chunks
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { mulaw } from "alawmulaw";
import { transcribe as llmTranscribe } from "@/lib/llm/client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { callSid, conversationId, audioBase64 } = await req.json();

    if (!audioBase64) {
      return NextResponse.json({ text: "", confidence: 0 });
    }

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.error("[Media Stream Process] No OpenAI API key");
        return NextResponse.json({ text: "", confidence: 0 });
      }

    // Convert base64 mulaw audio to PCM 16kHz for Whisper
    // 1. Decode mulaw 8kHz to PCM 8kHz
    // 2. Upsample PCM 8kHz to PCM 16kHz
    // 3. Create WAV file with PCM 16kHz
    const mulawBuffer = Buffer.from(audioBase64, 'base64');
    
    try {
      console.log(`[Media Stream Process] Decoding ${mulawBuffer.length} bytes of mulaw audio...`);
      
      // Step 1: Decode mulaw to PCM 8kHz (16-bit samples)
      const mulawSamples = new Uint8Array(mulawBuffer);
      
      // Validate mulaw input - check if it looks like valid mulaw data
      // Mulaw values should be in range 0-255, and typically not all zeros
      const nonZeroCount = mulawSamples.filter(s => s !== 0).length;
      const zeroPercentage = ((mulawSamples.length - nonZeroCount) / mulawSamples.length) * 100;
      console.log(`[Media Stream Process] Mulaw input: ${mulawSamples.length} bytes, ${nonZeroCount} non-zero (${(100-zeroPercentage).toFixed(1)}% non-zero)`);
      
      if (zeroPercentage > 95) {
        console.warn(`[Media Stream Process] ⚠️  WARNING: ${zeroPercentage.toFixed(1)}% of mulaw samples are zero - audio might be silence or corrupted`);
      }
      
      const pcm8kSamples = mulaw.decode(mulawSamples); // Returns Int16Array of 16-bit PCM samples
      
      console.log(`[Media Stream Process] Decoded to ${pcm8kSamples.length} PCM 8kHz samples`);
      
      // Validate decoded PCM samples
      const pcmNonZeroCount = Array.from(pcm8kSamples).filter(s => s !== 0).length;
      const pcmZeroPercentage = ((pcm8kSamples.length - pcmNonZeroCount) / pcm8kSamples.length) * 100;
      console.log(`[Media Stream Process] PCM 8kHz: ${pcmNonZeroCount} non-zero samples (${(100-pcmZeroPercentage).toFixed(1)}% non-zero)`);
      
      // Check minimum audio length - Whisper needs at least ~0.5-1 second of audio
      const minSamples8k = 4000; // 0.5 seconds at 8kHz
      if (pcm8kSamples.length < minSamples8k) {
        console.log(`[Media Stream Process] ⚠️  Audio too short (${pcm8kSamples.length} samples < ${minSamples8k}), skipping Whisper call`);
        const debugInfo = { 
          rms: "N/A", 
          threshold: "N/A", 
          audioLength: pcm8kSamples.length,
          reason: `Audio too short: ${pcm8kSamples.length} samples (need ${minSamples8k})`
        };
        return NextResponse.json({ text: "", confidence: 0, debug: debugInfo });
      }
      
      // Check if audio contains actual sound (not just silence)
      // Calculate RMS (Root Mean Square) to detect if there's actual audio
      let sumSquares = 0;
      let maxSample = 0;
      let minSample = 0;
      for (let i = 0; i < pcm8kSamples.length; i++) {
        const sample = pcm8kSamples[i];
        sumSquares += sample * sample;
        if (sample > maxSample) maxSample = sample;
        if (sample < minSample) minSample = sample;
      }
      const rms = Math.sqrt(sumSquares / pcm8kSamples.length);
      const silenceThreshold = 10; // Very low threshold - only filter out complete silence
      console.log(`[Media Stream Process] Audio RMS: ${rms.toFixed(2)} (threshold: ${silenceThreshold}), range: [${minSample}, ${maxSample}]`);
      
      // Return RMS in response for debugging (even if we skip Whisper)
      const debugInfo = { 
        rms: rms.toFixed(2), 
        threshold: silenceThreshold, 
        audioLength: pcm8kSamples.length,
        minSample,
        maxSample,
        durationSeconds: (pcm8kSamples.length / 8000).toFixed(2)
      };
      
      // Temporarily disable silence filtering to debug - let Whisper decide
      // if (rms < silenceThreshold) {
      //   console.log(`[Media Stream Process] ⚠️  Audio appears to be silence (RMS: ${rms.toFixed(2)} < ${silenceThreshold}), skipping Whisper call`);
      //   return NextResponse.json({ text: "", confidence: 0, debug: debugInfo });
      // }
      
      // Step 2: Upsample PCM 8kHz to PCM 16kHz using linear interpolation
      const pcm16kSamples: number[] = [];
      const pcm8kArray = Array.from(pcm8kSamples); // Convert Int16Array to regular array
      for (let i = 0; i < pcm8kArray.length; i++) {
        pcm16kSamples.push(pcm8kArray[i]);
        // Interpolate between samples for upsampling
        if (i < pcm8kArray.length - 1) {
          const interpolated = Math.round((pcm8kArray[i] + pcm8kArray[i + 1]) / 2);
          pcm16kSamples.push(interpolated);
        } else {
          // Duplicate last sample
          pcm16kSamples.push(pcm8kArray[i]);
        }
      }
      
      console.log(`[Media Stream Process] Upsampled to ${pcm16kSamples.length} PCM 16kHz samples`);
      
      // Step 3: Convert PCM samples to 16-bit LE buffer
      const pcm16kBuffer = Buffer.alloc(pcm16kSamples.length * 2);
      for (let i = 0; i < pcm16kSamples.length; i++) {
        // Clamp to 16-bit range
        const sample = Math.max(-32768, Math.min(32767, pcm16kSamples[i]));
        pcm16kBuffer.writeInt16LE(sample, i * 2);
      }
      
      // Step 4: Create WAV file header for PCM 16kHz 16-bit mono
      const sampleRate = 16000;
      const numChannels = 1;
      const bitsPerSample = 16;
      const dataSize = pcm16kBuffer.length;
      const fileSize = 36 + dataSize; // Total file size: 44 byte header - 8 bytes (RIFF + size) + dataSize
      const riffChunkSize = fileSize - 8; // RIFF chunk size = total file size minus 8 bytes (RIFF + size fields)
      
      const wavHeader = Buffer.alloc(44);
      wavHeader.write('RIFF', 0);
      wavHeader.writeUInt32LE(riffChunkSize, 4); // Fix: Use riffChunkSize, not fileSize
      wavHeader.write('WAVE', 8);
      wavHeader.write('fmt ', 12);
      wavHeader.writeUInt32LE(16, 16); // fmt chunk size (16 for PCM)
      wavHeader.writeUInt16LE(1, 20); // audio format (1 = PCM)
      wavHeader.writeUInt16LE(numChannels, 22);
      wavHeader.writeUInt32LE(sampleRate, 24);
      wavHeader.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28); // byte rate
      wavHeader.writeUInt16LE(numChannels * bitsPerSample / 8, 32); // block align
      wavHeader.writeUInt16LE(bitsPerSample, 34);
      wavHeader.write('data', 36);
      wavHeader.writeUInt32LE(dataSize, 40);
      
      const wavFile = Buffer.concat([wavHeader, pcm16kBuffer]);
      console.log(`[Media Stream Process] Created WAV file: ${wavFile.length} bytes (PCM 16kHz 16-bit mono)`);
      console.log(`[Media Stream Process] WAV details: dataSize=${dataSize}, fileSize=${fileSize}, riffChunkSize=${riffChunkSize}, duration=${(dataSize / (sampleRate * numChannels * bitsPerSample / 8)).toFixed(2)}s`);
      
      // Calculate audio duration for logging
      const audioDurationSeconds = dataSize / (sampleRate * numChannels * bitsPerSample / 8);
      console.log(`[Media Stream Process] 📤 Sending ${wavFile.length} bytes to Whisper API (${audioDurationSeconds.toFixed(2)}s of audio)...`);
      
      // Log first few bytes of WAV header to verify format
      const headerPreview = Array.from(wavFile.slice(0, 12)).map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log(`[Media Stream Process] WAV header preview (hex): ${headerPreview}`);
      
      // Whisper transcription via the LLM adapter (lib/llm/client.ts).
      // We hand it a Blob built from the WAV buffer; the adapter wraps
      // multipart/form-data and FormData posting.
      const audioBlob = new Blob([new Uint8Array(wavFile)], { type: "audio/wav" });

      const whisperStartTime = Date.now();
      console.log(`[Media Stream Process] 📤 Sending to Whisper via LLM adapter: ${wavFile.length} bytes WAV, ${audioDurationSeconds.toFixed(2)}s duration`);

      try {
        const transcription = await llmTranscribe({
          audio: audioBlob,
          model: "whisper-1",
          language: "en",
        });
        
        const whisperEndTime = Date.now();
        const transcribedText = transcription.text || '';
        
        console.log(`[Media Stream Process] ⏱️  Whisper API call took ${whisperEndTime - whisperStartTime}ms`);
        console.log(`[Media Stream Process] ✅ Whisper API success. Transcribed: "${transcribedText}"`);
        
        // If transcription is empty but RMS is high, log a warning with more details
        if (!transcribedText) {
          const rmsValue = parseFloat(debugInfo.rms as string);
          if (rmsValue > 50) {
            console.warn(`[Media Stream Process] ⚠️  WARNING: Whisper returned empty text despite high RMS (${debugInfo.rms}). Audio format might be incorrect.`);
            console.warn(`[Media Stream Process] ⚠️  Audio details: ${debugInfo.audioLength} samples, duration: ${debugInfo.durationSeconds}s, range: [${debugInfo.minSample}, ${debugInfo.maxSample}]`);
          } else if (rmsValue < 10) {
            console.log(`[Media Stream Process] ℹ️  Whisper returned empty text - audio appears to be silence (RMS: ${debugInfo.rms})`);
          } else {
            console.log(`[Media Stream Process] ℹ️  Whisper returned empty text - RMS: ${debugInfo.rms}, might be too quiet or corrupted`);
          }
        }
        
        return NextResponse.json({
          text: transcribedText,
          confidence: 1.0, // Whisper doesn't provide confidence scores
          debug: debugInfo, // Include debug info for troubleshooting
        });
      } catch (whisperError: any) {
        const whisperEndTime = Date.now();
        console.error(`[Media Stream Process] ❌ Whisper API error: ${whisperError.message}`);
        console.error(`[Media Stream Process] ❌ Error details:`, whisperError);
        console.error(`[Media Stream Process] ❌ WAV file size was: ${wavFile.length} bytes, dataSize: ${dataSize} bytes`);
        console.error(`[Media Stream Process] ❌ Audio duration: ${(dataSize / (sampleRate * numChannels * bitsPerSample / 8)).toFixed(2)}s`);
        console.error(`[Media Stream Process] ❌ WAV header preview: ${headerPreview}`);
        return NextResponse.json({ 
          text: "", 
          confidence: 0, 
          debug: { 
            ...debugInfo, 
            whisperError: whisperError.message || String(whisperError),
            whisperStatus: whisperError.status || 'unknown'
          } 
        });
      }
    } catch (sttError: any) {
      console.error(`[Media Stream Process] ❌ STT processing error:`, sttError.message);
      console.error(`[Media Stream Process] Error stack:`, sttError.stack);
      // Try to return debug info if we have it
      let debugInfo: Record<string, unknown> = { error: sttError.message };
      try {
        const mulawSamples = new Uint8Array(Buffer.from(audioBase64, 'base64'));
        const pcm8kSamples = mulaw.decode(mulawSamples);
        let sumSquares = 0;
        for (let i = 0; i < pcm8kSamples.length; i++) {
          sumSquares += pcm8kSamples[i] * pcm8kSamples[i];
        }
        const rms = Math.sqrt(sumSquares / pcm8kSamples.length);
        debugInfo = { rms: rms.toFixed(2), error: sttError.message, audioLength: pcm8kSamples.length };
      } catch (e) {
        // Ignore
      }
      return NextResponse.json({ text: "", confidence: 0, debug: debugInfo });
    }
  } catch (error: any) {
    console.error("[Media Stream Process] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process audio" },
      { status: 500 }
    );
  }
}

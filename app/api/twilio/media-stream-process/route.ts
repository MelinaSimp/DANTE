/**
 * Process audio from Media Streams
 * Called by the WebSocket server to process audio chunks
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import FormData from "form-data";
import { mulaw } from "alawmulaw";

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
      const pcm8kSamples = mulaw.decode(mulawSamples); // Returns Int16Array of 16-bit PCM samples
      
      console.log(`[Media Stream Process] Decoded to ${pcm8kSamples.length} PCM 8kHz samples`);
      
      // Check if audio contains actual sound (not just silence)
      // Calculate RMS (Root Mean Square) to detect if there's actual audio
      let sumSquares = 0;
      for (let i = 0; i < pcm8kSamples.length; i++) {
        sumSquares += pcm8kSamples[i] * pcm8kSamples[i];
      }
      const rms = Math.sqrt(sumSquares / pcm8kSamples.length);
      const silenceThreshold = 100; // Threshold for detecting silence
      console.log(`[Media Stream Process] Audio RMS: ${rms.toFixed(2)} (threshold: ${silenceThreshold})`);
      
      if (rms < silenceThreshold) {
        console.log(`[Media Stream Process] ⚠️  Audio appears to be silence, skipping Whisper call`);
        return NextResponse.json({ text: "", confidence: 0 });
      }
      
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
      const fileSize = 36 + dataSize;
      
      const wavHeader = Buffer.alloc(44);
      wavHeader.write('RIFF', 0);
      wavHeader.writeUInt32LE(fileSize, 4);
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
      
      // Create FormData for Whisper API (Node.js compatible)
      const formData = new FormData();
      formData.append('file', wavFile, {
        filename: 'audio.wav',
        contentType: 'audio/wav',
      });
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');
      formData.append('response_format', 'json');

      console.log(`[Media Stream Process] 📤 Sending ${wavFile.length} bytes to Whisper API...`);
      const whisperStartTime = Date.now();
      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          ...formData.getHeaders(),
        },
        body: formData as any,
      });
      const whisperEndTime = Date.now();
      console.log(`[Media Stream Process] ⏱️  Whisper API call took ${whisperEndTime - whisperStartTime}ms, status: ${whisperResponse.status}`);

      if (whisperResponse.ok) {
        const result = await whisperResponse.json();
        const transcribedText = result.text || '';
        
        console.log(`[Media Stream Process] ✅ Whisper API success. Transcribed: "${transcribedText}"`);
        
        return NextResponse.json({
          text: transcribedText,
          confidence: 1.0, // Whisper doesn't provide confidence scores
        });
      } else {
        const errorText = await whisperResponse.text();
        console.error(`[Media Stream Process] ❌ Whisper API error: ${whisperResponse.status} ${errorText}`);
        return NextResponse.json({ text: "", confidence: 0 });
      }
    } catch (sttError: any) {
      console.error(`[Media Stream Process] ❌ STT processing error:`, sttError.message);
      console.error(`[Media Stream Process] Error stack:`, sttError.stack);
      return NextResponse.json({ text: "", confidence: 0 });
    }
  } catch (error: any) {
    console.error("[Media Stream Process] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process audio" },
      { status: 500 }
    );
  }
}

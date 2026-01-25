/**
 * Process audio from Media Streams
 * Called by the WebSocket server to process audio chunks
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import FormData from "form-data";

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

    // Convert base64 mulaw audio to a format Whisper can understand
    // Whisper expects PCM 16kHz, but we have mulaw 8kHz
    // We'll need to decode mulaw to PCM first
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    
    // For now, we'll send the raw audio to Whisper
    // Note: Whisper API expects audio in specific formats
    // We'll use a File-like object with the audio data
    
    try {
      // Convert mulaw buffer to a WAV file format that Whisper can understand
      // WAV header for mulaw 8kHz mono
      const sampleRate = 8000;
      const numChannels = 1;
      const bitsPerSample = 8;
      const dataSize = audioBuffer.length;
      const fileSize = 36 + dataSize;
      
      const wavHeader = Buffer.alloc(44);
      wavHeader.write('RIFF', 0);
      wavHeader.writeUInt32LE(fileSize, 4);
      wavHeader.write('WAVE', 8);
      wavHeader.write('fmt ', 12);
      wavHeader.writeUInt32LE(18, 16); // fmt chunk size
      wavHeader.writeUInt16LE(7, 20); // audio format (7 = mulaw/G.711)
      wavHeader.writeUInt16LE(numChannels, 22);
      wavHeader.writeUInt32LE(sampleRate, 24);
      wavHeader.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28); // byte rate
      wavHeader.writeUInt16LE(numChannels * bitsPerSample / 8, 32); // block align
      wavHeader.writeUInt16LE(bitsPerSample, 34);
      wavHeader.writeUInt16LE(0, 36); // extra param size
      wavHeader.write('data', 38);
      wavHeader.writeUInt32LE(dataSize, 40);
      
      const wavFile = Buffer.concat([wavHeader, audioBuffer]);
      
      // Create FormData for Whisper API (Node.js compatible)
      const formData = new FormData();
      formData.append('file', wavFile, {
        filename: 'audio.wav',
        contentType: 'audio/wav',
      });
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');
      formData.append('response_format', 'json');

      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          ...formData.getHeaders(),
        },
        body: formData as any,
      });

      if (whisperResponse.ok) {
        const result = await whisperResponse.json();
        const transcribedText = result.text || '';
        
        console.log(`[Media Stream Process] Transcribed: "${transcribedText}"`);
        
        return NextResponse.json({
          text: transcribedText,
          confidence: 1.0, // Whisper doesn't provide confidence scores
        });
      } else {
        const errorText = await whisperResponse.text();
        console.error(`[Media Stream Process] Whisper API error: ${whisperResponse.status} ${errorText}`);
        return NextResponse.json({ text: "", confidence: 0 });
      }
    } catch (sttError: any) {
      console.error(`[Media Stream Process] STT processing error:`, sttError.message);
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

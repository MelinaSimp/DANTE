/**
 * Process audio from Media Streams
 * Called by the WebSocket server to process audio chunks
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { callSid, conversationId, audioBase64 } = await req.json();

    // For now, return empty - in production, use a real-time STT service
    // like Deepgram, AssemblyAI, or Google Speech-to-Text
    
    // TODO: Implement real-time speech-to-text
    // For now, we'll rely on Twilio's built-in transcription
    
    return NextResponse.json({
      text: "", // Will be filled by real-time STT
      confidence: 0,
    });
  } catch (error: any) {
    console.error("[Media Stream Process] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process audio" },
      { status: 500 }
    );
  }
}

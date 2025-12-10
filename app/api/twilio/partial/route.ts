// app/api/twilio/partial/route.ts
// Handle Twilio partial speech results for interruptability

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * Twilio Partial Result Callback
 * POST /api/twilio/partial
 * 
 * Called by Twilio when user starts speaking while audio is playing
 * Enables interruptability - user can interrupt agent mid-speech
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const conversationId = formData.get("conversationId")?.toString() || "";
    const speechResult = formData.get("SpeechResult")?.toString() || "";
    const isFinal = formData.get("IsFinal")?.toString() === "true";
    
    console.log("[Twilio Partial] Received:", {
      conversationId,
      speechResult: speechResult.substring(0, 50),
      isFinal
    });
    
    // If user is speaking while agent is talking, stop audio and process
    if (!isFinal && speechResult && speechResult.trim().length > 0) {
      // Stop current audio playback and redirect to response handler
      const responseUrl = `/api/twilio/response?conversationId=${conversationId}&interrupted=true`;
      
      return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Pause length="1"/>
          <Redirect>${responseUrl}</Redirect>
        </Response>`, {
        headers: { "Content-Type": "text/xml; charset=utf-8" }
      });
    }
    
    // If final, let the normal response handler process it
    return new NextResponse("", { status: 200 });
  } catch (error: any) {
    console.error("[Twilio Partial] Error:", error);
    // Return empty response to avoid Twilio retries
    return new NextResponse("", { status: 200 });
  }
}





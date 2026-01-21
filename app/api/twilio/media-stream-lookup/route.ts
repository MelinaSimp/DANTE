/**
 * Lookup conversation by callSid for Railway WebSocket server
 * POST /api/twilio/media-stream-lookup
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 5;

export async function POST(req: NextRequest) {
  try {
    const { callSid } = await req.json();

    if (!callSid) {
      return NextResponse.json(
        { error: "callSid is required" },
        { status: 400 }
      );
    }

    // Look up conversation by channel_id (callSid)
    const { data: conversation, error } = await supabaseAdmin
      .from("conversations")
      .select("id")
      .eq("channel_id", callSid)
      .eq("modality", "voice")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[Media Stream Lookup] Error finding conversation:", error);
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 }
      );
    }

    if (!conversation) {
      console.warn(`[Media Stream Lookup] No conversation found for callSid: ${callSid}`);
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      conversationId: conversation.id,
    });
  } catch (error: any) {
    console.error("[Media Stream Lookup] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Unexpected error" },
      { status: 500 }
    );
  }
}

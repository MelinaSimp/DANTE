import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 5; // 5 seconds max for status callbacks

/**
 * Twilio Status Callback Webhook
 * POST /api/twilio/status
 * 
 * This endpoint receives call status updates from Twilio
 * Configure this URL in your Twilio phone number settings:
 * Voice & Fax > STATUS CALLBACK URL
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const callSid = formData.get("CallSid")?.toString() || "";
    const callStatus = formData.get("CallStatus")?.toString() || "";
    const from = formData.get("From")?.toString() || "";
    const to = formData.get("To")?.toString() || "";
    const duration = formData.get("Duration")?.toString() || "";
    const recordingUrl = formData.get("RecordingUrl")?.toString() || "";

    console.log("[Twilio] Status update:", {
      callSid,
      callStatus,
      from,
      to,
      duration,
      recordingUrl,
    });

    // Store call status in database
    if (callSid) {
      // Find conversation by channel_id (callSid)
      const { data: conversation } = await supabaseAdmin
        .from("conversations")
        .select("id, workspace_id")
        .eq("channel_id", callSid)
        .maybeSingle();

      if (conversation) {
        // Update conversation status
        const updates: any = {
          updated_at: new Date().toISOString(),
        };

        if (callStatus === "completed" || callStatus === "busy" || callStatus === "no-answer" || callStatus === "failed") {
          updates.status = "completed";
        }

        if (duration) {
          updates.metadata = {
            ...(conversation.metadata || {}),
            duration: parseInt(duration) || 0,
            recordingUrl,
          };
        }

        await supabaseAdmin
          .from("conversations")
          .update(updates)
          .eq("id", conversation.id);

        // Store in call_sessions table if it exists
        try {
          await supabaseAdmin
            .from("call_sessions")
            .upsert({
              call_sid: callSid,
              from_number: from,
              to_number: to,
              status: callStatus,
              transcript: conversation.transcript || [],
              conversation_state: {},
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, {
              onConflict: "call_sid",
            });
        } catch (e) {
          // call_sessions table might not exist, that's okay
          console.log("call_sessions table not found, skipping");
        }
      }
    }

    return NextResponse.json({ success: true }, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Twilio] Status callback error:", error);
    return NextResponse.json({ success: false, error: "Failed to process status" }, { status: 500 });
  }
}


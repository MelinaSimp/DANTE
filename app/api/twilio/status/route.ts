import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateTwilioRequest } from "@/lib/twilio-validate";

export const dynamic = "force-dynamic";
export const maxDuration = 5;

// Terminal Twilio call statuses — once we see one of these, we mark
// the matching `conversations` row completed. We used to also persist
// a transcript row into `receptionist_call_logs` here so the (now
// removed) /calls page could render it; that surface was unreliable
// and was dropped. If we ever resurrect a call-transcript view, write
// the persistence path in a dedicated module and unit-test it before
// wiring it back in.
const TERMINAL_STATUSES = new Set(["completed", "busy", "no-answer", "failed", "canceled"]);

/**
 * Twilio Status Callback Webhook
 * POST /api/twilio/status
 *
 * Configure this URL in your Twilio phone number settings:
 * Voice & Fax > STATUS CALLBACK URL
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await validateTwilioRequest(req))) {
      return new NextResponse("Forbidden", { status: 403 });
    }

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

    if (callSid) {
      const { data: conversation } = await supabaseAdmin
        .from("conversations")
        .select("id, metadata, transcript")
        .eq("channel_id", callSid)
        .maybeSingle();

      if (conversation) {
        const updates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        if (TERMINAL_STATUSES.has(callStatus)) {
          updates.status = "completed";
        }

        if (duration) {
          updates.metadata = {
            ...((conversation.metadata as Record<string, unknown>) || {}),
            duration: parseInt(duration) || 0,
            recordingUrl,
          };
        }

        await supabaseAdmin
          .from("conversations")
          .update(updates)
          .eq("id", conversation.id);

        // Best-effort mirror to call_sessions for any legacy readers.
        // The table may not exist in every environment; swallow the error.
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
        } catch {
          // call_sessions not present — fine.
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

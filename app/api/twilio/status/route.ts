import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateTwilioRequest } from "@/lib/twilio-validate";

export const dynamic = "force-dynamic";
export const maxDuration = 5;

// Terminal Twilio call statuses that should trigger the transcript
// being persisted to receptionist_call_logs (the table /calls reads).
const TERMINAL_STATUSES = new Set(["completed", "busy", "no-answer", "failed", "canceled"]);

// Shape of each entry in conversations.transcript (written by
// app/api/twilio/response/route.ts). Kept loose so a stray field
// in the JSON doesn't trip us.
interface TranscriptMessage {
  role?: string;
  content?: string;
  timestamp?: string;
}

// The `/calls` page reads answers as an array of { prompt, answer,
// captured_at }. Conversations store a flat role/content stream.
// We pair each assistant turn (the "question" the AI asked) with
// the immediately-following user turn (the caller's reply). A final
// assistant turn with no user response after it still shows up so
// the advisor can see what the AI last said.
function transcriptToAnswers(transcript: TranscriptMessage[]): Array<{
  question_id: string;
  prompt: string;
  answer: string | null;
  captured_at: string | null;
}> {
  const out: Array<{
    question_id: string;
    prompt: string;
    answer: string | null;
    captured_at: string | null;
  }> = [];
  let pendingPrompt: TranscriptMessage | null = null;
  let idx = 0;
  for (const msg of transcript) {
    if (msg.role === "assistant") {
      if (pendingPrompt) {
        // An assistant turn without a user reply in between — log it
        // with no answer so the advisor sees the full flow.
        out.push({
          question_id: `q${idx++}`,
          prompt: pendingPrompt.content || "",
          answer: null,
          captured_at: pendingPrompt.timestamp ?? null,
        });
      }
      pendingPrompt = msg;
    } else if (msg.role === "user" && pendingPrompt) {
      out.push({
        question_id: `q${idx++}`,
        prompt: pendingPrompt.content || "",
        answer: msg.content || "",
        captured_at: msg.timestamp ?? pendingPrompt.timestamp ?? null,
      });
      pendingPrompt = null;
    }
  }
  if (pendingPrompt) {
    out.push({
      question_id: `q${idx++}`,
      prompt: pendingPrompt.content || "",
      answer: null,
      captured_at: pendingPrompt.timestamp ?? null,
    });
  }
  return out;
}

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

    // Store call status in database
    if (callSid) {
      // Find conversation by channel_id (callSid)
      const { data: conversation } = await supabaseAdmin
        .from("conversations")
        .select("id, workspace_id, metadata, transcript")
        .eq("channel_id", callSid)
        .maybeSingle();

      if (conversation) {
        // Update conversation status
        const updates: any = {
          updated_at: new Date().toISOString(),
        };

        const isTerminal = TERMINAL_STATUSES.has(callStatus);
        if (isTerminal) {
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

        // Persist a transcript row to receptionist_call_logs so the
        // /calls page can render it. The old /pages/api/receptionist
        // pipeline wrote here via logCompletedCall(); the new Twilio
        // App-Router voice path forgot to, which is why /calls stays
        // empty after a successful call. We do the write here — the
        // status webhook is the one place that's guaranteed to fire
        // once the call has fully ended.
        //
        // Guarded by an existence check on call_sid so Twilio's
        // retries / duplicate terminal callbacks don't double-insert.
        if (isTerminal && conversation.workspace_id) {
          try {
            const { data: existing } = await supabaseAdmin
              .from("receptionist_call_logs")
              .select("id")
              .eq("call_sid", callSid)
              .maybeSingle();

            if (!existing) {
              const transcriptMessages: TranscriptMessage[] = Array.isArray(conversation.transcript)
                ? (conversation.transcript as TranscriptMessage[])
                : [];
              const answers = transcriptToAnswers(transcriptMessages);
              // Final assistant turn is the "AI follow-up" block on
              // the /calls page — pull the last assistant message.
              const lastAssistant = [...transcriptMessages]
                .reverse()
                .find((m) => m.role === "assistant");
              const aiResponse = lastAssistant?.content || "";

              const { error: logErr } = await supabaseAdmin
                .from("receptionist_call_logs")
                .insert({
                  workspace_id: conversation.workspace_id,
                  call_sid: callSid,
                  from_number: from || null,
                  to_number: to || null,
                  answers,
                  ai_response: aiResponse,
                  analysis: null,
                });
              if (logErr) {
                console.error("[Twilio] Failed to write receptionist_call_logs:", logErr);
              } else {
                console.log("[Twilio] Logged call transcript:", {
                  callSid,
                  answers_count: answers.length,
                });
              }
            }
          } catch (err) {
            console.error("[Twilio] Transcript persistence error (non-blocking):", err);
          }
        }

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


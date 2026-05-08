/**
 * VAPI Server URL Webhook
 * Handles events from VAPI during voice calls:
 * - tool-calls: Execute scheduling functions
 * - end-of-call-report: Log conversation to Supabase
 * - status-update: Track call status
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { naiveLocalIsoToUtcIso, appDayRangeUtcIso, appWallClockToUtcMs, getAppTimezone } from "@/lib/app-timezone";
import { recordVoiceUsage } from "@/lib/usage/track";
import { logChurnEvent } from "@/lib/dante/churn-events";
import { normalizePhone } from "@/lib/phone";
import { summarizeCall, type TranscriptSegment } from "@/lib/calls/summarize";
import { classifyCallSentiment } from "@/lib/calls/sentiment";
import { analyzeEngagement } from "@/lib/calls/engagement";
import { scanForCompliance } from "@/lib/compliance/scan";
import { retrieveReferences, formatReferenceContext } from "@/lib/references/retrieve";
import dayjs from "dayjs";

export const dynamic = "force-dynamic";
// Inbound end-of-call-report kicks off a summarizer + compliance pass
// for calls where we matched the caller to a known contact. The LLM
// work runs under `after()` (post-response), but its deadline is
// bounded by this route's maxDuration. Summarization usually completes
// in 5–20s — 300s gives generous headroom for cold starts + retries.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const vapiSecret = process.env.VAPI_WEBHOOK_SECRET;
    if (vapiSecret) {
      const headerSecret = req.headers.get("x-vapi-secret") || req.headers.get("authorization")?.replace("Bearer ", "");
      if (headerSecret !== vapiSecret) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = await req.json();
    const { message } = body;

    // Log full payload for debugging
    console.log(`[VAPI Webhook] Raw payload keys: ${JSON.stringify(Object.keys(body))}`);
    
    if (!message || !message.type) {
      // VAPI might send tool calls at the top level (tool-level server URL format)
      if (body.message?.type) {
        // nested message
      } else {
        console.log(`[VAPI Webhook] Full body (no message.type): ${JSON.stringify(body).substring(0, 500)}`);
        return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
      }
    }

    const eventType = message.type;
    console.log(`[VAPI Webhook] Event: ${eventType}`);

    switch (eventType) {
      case "tool-calls":
        return handleToolCalls(message);

      case "function-call":
        return handleToolCalls(message);

      case "end-of-call-report":
        return handleEndOfCallReport(message);

      case "status-update":
        return handleStatusUpdate(message);

      case "assistant-request":
        return handleAssistantRequest(message);

      default:
        console.log(`[VAPI Webhook] Unhandled event type: ${eventType}`);
        return NextResponse.json({ ok: true });
    }
  } catch (err: any) {
    console.error("[VAPI Webhook] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Also handle GET for health checks
export async function GET() {
  return NextResponse.json({ status: "ok", service: "vapi-server-url" });
}

// ─── Tool Calls ──────────────────────────────────────────────

async function handleToolCalls(message: any) {
  // VAPI can send tool calls in multiple formats
  const toolCalls = message.toolCallList || message.toolWithToolCallList || [];
  const call = message.call;
  const results: any[] = [];

  console.log(`[VAPI Webhook] Tool calls count: ${toolCalls.length}`);
  console.log(`[VAPI Webhook] Call object keys: ${call ? JSON.stringify(Object.keys(call)) : "null"}`);
  console.log(`[VAPI Webhook] Call assistantId: ${call?.assistantId || "none"}`);
  console.log(`[VAPI Webhook] Message keys: ${JSON.stringify(Object.keys(message))}`);
  
  if (toolCalls.length === 0) {
    // Try alternative format: single function call
    if (message.functionCall) {
      console.log(`[VAPI Webhook] Found single functionCall: ${JSON.stringify(message.functionCall).substring(0, 200)}`);
      toolCalls.push({
        id: message.functionCall.id || "fc-1",
        name: message.functionCall.name,
        parameters: message.functionCall.parameters,
      });
    }
  }

  for (const toolCall of toolCalls) {
    const id = toolCall.id || toolCall.toolCall?.id || "unknown";
    const name = toolCall.name || toolCall.function?.name || "unknown";
    
    // VAPI sends parameters as toolCall.function.arguments (JSON string) — parse it
    let parameters: any = {};
    if (toolCall.parameters && Object.keys(toolCall.parameters).length > 0) {
      parameters = toolCall.parameters;
    } else if (toolCall.function?.arguments) {
      try {
        parameters = typeof toolCall.function.arguments === "string"
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function.arguments;
      } catch { parameters = {}; }
    } else if (toolCall.toolCall?.parameters) {
      parameters = toolCall.toolCall.parameters;
    }
    
    let result: string;

    console.log(`[VAPI Webhook] Processing tool: ${name}, id: ${id}, params: ${JSON.stringify(parameters).substring(0, 300)}`);

    try {
      switch (name) {
        case "schedule_appointment":
          result = await executeScheduleAppointment(call, parameters);
          break;
        case "check_availability":
          result = await executeCheckAvailability(call, parameters);
          break;
        case "send_to_voicemail":
          // Voicemail step — flag the call so end-of-call-report
          // routes the transcript+recording to the advisor's inbox.
          // VAPI is already recording every call; we just need to
          // mark this one as voicemail-only and tell the model how
          // to wrap up.
          result = await executeSendToVoicemail(call, parameters);
          break;
        case "transfer_call":
          // Transfer step — VAPI honors `destination` in the tool
          // result and performs the actual call bridge. We just
          // validate the number and pass it through. Per-call
          // logging happens via the existing end-of-call report.
          result = await executeTransferCall(call, parameters);
          break;
        default:
          result = JSON.stringify({ error: `Unknown function: ${name}` });
      }
    } catch (err: any) {
      console.error(`[VAPI Webhook] Tool call ${name} failed:`, err);
      result = JSON.stringify({ error: err.message });
    }

    results.push({
      name,
      toolCallId: id,
      result,
    });
  }

  return NextResponse.json({ results });
}

/**
 * send_to_voicemail tool handler — fires when the scenario script
 * reaches a Voicemail step. We don't ourselves do recording: VAPI
 * records every call by default and the recording_url shows up on
 * the end-of-call-report artifact. This handler's only job is to
 *   (a) mark the call as voicemail-only by stamping a flag we can
 *       read in handleEndOfCallReport, and
 *   (b) hand the model a guidance message it can use to thank the
 *       caller and end the conversation cleanly.
 *
 * The actual advisor-notification email is sent in
 * handleEndOfCallReport when it sees the voicemail flag — by then
 * the transcript and recording_url are both available.
 */
async function executeSendToVoicemail(call: any, params: any): Promise<string> {
  const callId = call?.id;
  const greeting =
    typeof params?.greeting === "string" && params.greeting.trim()
      ? params.greeting.trim()
      : "Please leave a message after the tone.";

  // Stash the voicemail flag on the call's metadata via the call_logs
  // table — the conversations row isn't created until end-of-call,
  // so we use a small lookup row keyed by the VAPI call id.
  if (callId) {
    try {
      await supabaseAdmin
        .from("vapi_voicemail_pending")
        .upsert(
          {
            vapi_call_id: callId,
            greeting,
            created_at: new Date().toISOString(),
          },
          { onConflict: "vapi_call_id" },
        );
    } catch (e) {
      // Non-fatal; we still return the right guidance to the model.
      console.warn("[VAPI Voicemail] Failed to record pending flag:", e);
    }
  }

  return JSON.stringify({
    success: true,
    message:
      "Voicemail mode active. Say the greeting verbatim, then stay quiet while the caller records. After they finish, thank them briefly and end the call.",
    greeting,
  });
}

/**
 * transfer_call tool handler — fires when the scenario script
 * reaches a Transfer step. The model passes the destination number
 * we already baked into the system prompt for that step. We
 * validate it's E.164-shaped and return a `destination` object;
 * VAPI honors that field on a tool result and performs the actual
 * call bridge (PSTN/SIP). The conversation row gets logged on
 * end-of-call-report as usual.
 *
 * If VAPI doesn't bridge for some reason (e.g. destination format
 * rejected upstream), the call simply continues; the model's next
 * turn will see the result string and can recover.
 */
function looksLikeE164(n: string): boolean {
  return /^\+\d{8,15}$/.test(n.trim());
}

async function executeTransferCall(call: any, params: any): Promise<string> {
  const raw = typeof params?.to_number === "string" ? params.to_number.trim() : "";
  // Allow common formatting (spaces, dashes, parens) — strip and
  // validate as E.164. If the script step has it stored without a
  // leading '+', tolerate that and prepend.
  const stripped = raw.replace(/[\s\-().]/g, "");
  const candidate = stripped.startsWith("+") ? stripped : `+${stripped.replace(/^1?/, "1")}`;

  if (!looksLikeE164(candidate)) {
    return JSON.stringify({
      success: false,
      message: `Couldn't transfer — the configured number "${raw}" isn't a valid phone number. Please verify the transfer step in the agent settings.`,
    });
  }

  // Best-effort log so the post-call audit shows where the call went.
  if (call?.id) {
    try {
      await supabaseAdmin.from("vapi_voicemail_pending").upsert(
        // Reuse the same lookup table as a lightweight per-call
        // metadata store; the schema (vapi_call_id pk, jsonb-ish
        // greeting field) doubles as a transfer log when greeting
        // looks like "transferred to <number>". A dedicated table
        // is the cleaner long-term answer.
        {
          vapi_call_id: call.id,
          greeting: `transferred to ${candidate}`,
          created_at: new Date().toISOString(),
        },
        { onConflict: "vapi_call_id" },
      );
    } catch {
      /* non-fatal */
    }
  }

  return JSON.stringify({
    success: true,
    message: `Transferring you now.`,
    // VAPI's documented contract for server-side tools: a `destination`
    // object on the tool result triggers a call transfer. type=number
    // performs a PSTN bridge; the optional message is what the model
    // says to the caller before the bridge completes.
    destination: {
      type: "number",
      number: candidate,
      message: "Connecting you now, please hold.",
    },
  });
}

async function executeScheduleAppointment(call: any, params: any): Promise<string> {
  const { contactName, scheduledAt: rawScheduledAt, serviceType, durationMinutes = 60, notes, conversationSummary } = params;

  // Naive ISO (no Z / offset) = wall clock in APP_TIMEZONE (e.g. America/New_York), not UTC.
  let scheduledAt = rawScheduledAt;
  if (scheduledAt) {
    try {
      const converted = naiveLocalIsoToUtcIso(scheduledAt);
      if (String(rawScheduledAt).trim() !== converted) {
        console.log(`[VAPI Schedule] TZ ${getAppTimezone()}: ${rawScheduledAt} → ${converted}`);
      }
      scheduledAt = converted;
    } catch (e) {
      console.error("[VAPI Schedule] Timezone conversion failed:", e);
    }
  }

  console.log(`[VAPI Schedule] Params: name=${contactName}, at=${scheduledAt}, type=${serviceType}, summary=${conversationSummary?.substring(0, 50)}`);

  if (!scheduledAt) {
    return JSON.stringify({ success: false, message: "I need a date and time for the appointment. When would you like to schedule?" });
  }

  // Find the agent by the VAPI assistant ID
  const assistantId = call?.assistantId;
  console.log(`[VAPI Schedule] Looking up agent by assistantId: ${assistantId}`);
  
  if (!assistantId) {
    console.error(`[VAPI Schedule] No assistantId in call object. Call keys: ${call ? JSON.stringify(Object.keys(call)) : "null"}`);
    return JSON.stringify({ success: false, message: "No assistant ID in call context" });
  }

  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("id, workspace_id")
    .eq("vapi_assistant_id", assistantId)
    .single();

  if (!agent) {
    return JSON.stringify({ success: false, message: "Agent not found for this assistant" });
  }

  // Get caller info from the call object
  const callerPhone = call?.customer?.number || call?.phoneNumber?.number || "+10000000000";
  const callerName = contactName || "Caller";
  const service = serviceType || "Consultation";

  try {
    // Find or create contact directly in the database
    let contactId: string;
    let contactEmail: string | null = null;
    const { data: existingContact } = await supabaseAdmin
      .from("contacts")
      .select("id, email")
      .eq("workspace_id", agent.workspace_id)
      .eq("phone", callerPhone)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
      contactEmail = existingContact.email || null;
      if (callerName !== "Caller") {
        await supabaseAdmin.from("contacts").update({ name: callerName }).eq("id", contactId);
      }
    } else {
      const { data: newContact, error: contactError } = await supabaseAdmin
        .from("contacts")
        .insert({ workspace_id: agent.workspace_id, name: callerName, phone: callerPhone })
        .select("id")
        .single();

      if (contactError || !newContact) {
        console.error("[VAPI Schedule] Failed to create contact:", contactError);
        return JSON.stringify({ success: false, message: "Failed to create contact for scheduling" });
      }
      contactId = newContact.id;
    }

    // Create the appointment (matching the schema used by /api/appointments)
    const { data: appointment, error: apptError } = await supabaseAdmin
      .from("appointments")
      .insert({
        workspace_id: agent.workspace_id,
        contact_id: contactId,
        scheduled_at: scheduledAt,
        duration_minutes: durationMinutes,
        service_type: service,
        status: "scheduled",
        notes: conversationSummary || notes || "Scheduled via voice call",
      })
      .select("id, scheduled_at")
      .single();

    if (apptError || !appointment) {
      console.error("[VAPI Schedule] Failed to create appointment:", JSON.stringify(apptError));
      return JSON.stringify({ success: false, message: `Failed to create the appointment: ${apptError?.message || "unknown error"}` });
    }

    // Dante churn signal: scheduled through voice agent counts as both
    // an appointment commitment AND a successful agent interaction.
    logChurnEvent({
      workspace_id: agent.workspace_id,
      contact_id: contactId,
      event_type: "appointment_scheduled",
      source: "vapi",
      source_id: appointment.id,
      metadata: { scheduled_at: scheduledAt, duration_minutes: durationMinutes, service_type: service },
    });
    logChurnEvent({
      workspace_id: agent.workspace_id,
      contact_id: contactId,
      event_type: "agent_interaction_positive",
      source: "vapi",
      source_id: appointment.id,
      metadata: { outcome: "appointment_booked" },
    });

    const tz = process.env.APP_TIMEZONE || "America/New_York";
    const formattedDate = new Date(scheduledAt).toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    });

    console.log(`[VAPI Schedule] Created appointment ${appointment.id} for ${callerName} at ${formattedDate}`);

    // Send confirmation email if contact has an email
    if (contactEmail) {
      try {
        const resendKey = process.env.RESEND_API_KEY;
        if (resendKey) {
          const { Resend } = await import("resend");
          const resend = new Resend(resendKey);
          const fromEmail = process.env.RESEND_FROM_EMAIL || "Drift <noreply@driftai.studio>";

          await resend.emails.send({
            from: fromEmail.includes("<") ? fromEmail : `Drift <${fromEmail}>`,
            to: [contactEmail],
            subject: `Appointment Confirmed: ${service} on ${formattedDate}`,
            html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1a1a1a;">Appointment Confirmed</h2>
              <p style="color: #555;">Hi ${callerName},</p>
              <p style="color: #555;">Your appointment has been booked. Here are the details:</p>
              <div style="background: #f5f5f7; padding: 20px; border-radius: 12px; margin: 16px 0;">
                <p style="margin: 0; color: #333;"><strong>Service:</strong> ${service}</p>
                <p style="margin: 8px 0 0; color: #333;"><strong>Date & Time:</strong> ${formattedDate}</p>
                <p style="margin: 8px 0 0; color: #333;"><strong>Duration:</strong> ${durationMinutes} minutes</p>
              </div>
              <p style="color: #555;">If you need to reschedule, please call us back.</p>
              <p style="color: #888; font-size: 12px; margin-top: 24px;">— Drift AI</p>
            </div>`,
          });
          console.log(`[VAPI Schedule] Confirmation email sent to ${contactEmail}`);
        }
      } catch (emailErr) {
        console.error("[VAPI Schedule] Failed to send confirmation email (non-fatal):", emailErr);
      }
    }

    return JSON.stringify({
      success: true,
      message: `Your appointment has been scheduled for ${formattedDate}. You're all set!`,
      appointmentId: appointment.id,
    });
  } catch (err: any) {
    console.error("[VAPI Schedule] Error:", err);
    return JSON.stringify({ success: false, message: "Something went wrong while scheduling. Please try again." });
  }
}

async function executeCheckAvailability(call: any, params: any): Promise<string> {
  const { date, durationMinutes = 60 } = params;

  if (!date) {
    return JSON.stringify({ success: false, message: "What date would you like to check? Please provide a date." });
  }

  const assistantId = call?.assistantId;
  if (!assistantId) {
    return JSON.stringify({ success: false, message: "No assistant ID in call context" });
  }

  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("id, workspace_id")
    .eq("vapi_assistant_id", assistantId)
    .single();

  if (!agent) {
    return JSON.stringify({ success: false, message: "Agent not found for this assistant" });
  }

  try {
    // 1. Get manually created open slots for this date (including slot_type)
    const { data: openSlots } = await supabaseAdmin
      .from("availability_slots")
      .select("start_time, end_time, slot_type")
      .eq("workspace_id", agent.workspace_id)
      .eq("slot_date", date);

    if (!openSlots || openSlots.length === 0) {
      const alternatives = await findNextAvailableSlots(agent.workspace_id, date, 3);
      if (alternatives.length > 0) {
        const altList = alternatives.map(a => `${a.date} at ${a.time}`).join(", ");
        return JSON.stringify({
          success: true,
          message: `There are no open slots on ${date}. However, the next available times are: ${altList}. Would any of those work for you?`,
        });
      }
      return JSON.stringify({
        success: true,
        message: `There are no open slots on ${date} and no availability in the coming days. Would you like to leave your information so we can contact you when availability opens up?`,
      });
    }

    const { startUtcIso, endExclusiveUtcIso } = appDayRangeUtcIso(date);

    // 2. Get existing appointments to subtract from open slots (same calendar day in app TZ)
    const { data: existingAppts } = await supabaseAdmin
      .from("appointments")
      .select("scheduled_at, duration_minutes")
      .eq("workspace_id", agent.workspace_id)
      .gte("scheduled_at", startUtcIso)
      .lt("scheduled_at", endExclusiveUtcIso)
      .neq("status", "cancelled");

    const busyTimes = (existingAppts || []).map((a) => ({
      start: new Date(a.scheduled_at).getTime(),
      end: new Date(a.scheduled_at).getTime() + (a.duration_minutes || 30) * 60000,
    }));

    // 3. For each open slot, generate available time windows grouped by slot type
    const windowsByType: Record<string, string[]> = {};
    for (const slot of openSlots) {
      const [sh, sm] = slot.start_time.split(":").map(Number);
      const [eh, em] = slot.end_time.split(":").map(Number);
      const type = slot.slot_type || "General";

      for (let h = sh; h < eh || (h === eh && 0 < em); h++) {
        for (let m = (h === sh ? sm : 0); m < 60; m += 30) {
          if (h > eh || (h === eh && m >= em)) break;
          
          const slotStartMs = appWallClockToUtcMs(date, h, m);
          const slotEndMs = slotStartMs + 30 * 60000;

          const isBusy = busyTimes.some((b) => slotStartMs < b.end && slotEndMs > b.start);
          if (!isBusy) {
            const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
            const ampm = h >= 12 ? "PM" : "AM";
            const displayMin = m === 0 ? "00" : String(m);
            if (!windowsByType[type]) windowsByType[type] = [];
            windowsByType[type].push(`${displayHour}:${displayMin} ${ampm}`);
          }
        }
      }
    }

    const typeEntries = Object.entries(windowsByType);
    if (typeEntries.length === 0) {
      const alternatives = await findNextAvailableSlots(agent.workspace_id, date, 3);
      if (alternatives.length > 0) {
        const altList = alternatives.map(a => `${a.date} at ${a.time}`).join(", ");
        return JSON.stringify({
          success: true,
          message: `All slots on ${date} are fully booked. The next available times are: ${altList}. Would any of those work for you?`,
        });
      }
      return JSON.stringify({
        success: true,
        message: `All slots on ${date} are fully booked and no availability was found in the coming days. Would you like to leave your information so we can contact you when availability opens up?`,
      });
    }

    const typeSummaries = typeEntries.map(([type, windows]) =>
      `${type}: ${windows.join(", ")}`
    );
    const availableTypes = typeEntries.map(([type]) => type);

    return JSON.stringify({
      success: true,
      availableTypes,
      message: `Available times on ${date} by category:\n${typeSummaries.join("\n")}\n\nAll of these times are within the consultant's open slots and available for booking. Tell the caller what types of appointments are available (${availableTypes.join(", ")}) and ask which type they'd like. Also ask how long they expect the meeting to take.`,
    });
  } catch (err: any) {
    console.error("[VAPI CheckAvailability] Error:", err);
    return JSON.stringify({ success: false, message: "Something went wrong while checking availability. Please try again." });
  }
}

async function findNextAvailableSlots(
  workspaceId: string,
  afterDate: string,
  count: number
): Promise<{ date: string; time: string }[]> {
  const results: { date: string; time: string }[] = [];
  const tz = getAppTimezone();

  for (let dayOffset = 1; dayOffset <= 14 && results.length < count; dayOffset++) {
    const d = dayjs.tz(afterDate, "YYYY-MM-DD", tz).add(dayOffset, "day");
    const dateStr = d.format("YYYY-MM-DD");

    const { data: slots } = await supabaseAdmin
      .from("availability_slots")
      .select("start_time, end_time")
      .eq("workspace_id", workspaceId)
      .eq("slot_date", dateStr);

    if (!slots || slots.length === 0) continue;

    const { startUtcIso, endExclusiveUtcIso } = appDayRangeUtcIso(dateStr);
    const { data: existingAppts } = await supabaseAdmin
      .from("appointments")
      .select("scheduled_at, duration_minutes")
      .eq("workspace_id", workspaceId)
      .gte("scheduled_at", startUtcIso)
      .lt("scheduled_at", endExclusiveUtcIso)
      .neq("status", "cancelled");

    const busyTimes = (existingAppts || []).map(a => ({
      start: new Date(a.scheduled_at).getTime(),
      end: new Date(a.scheduled_at).getTime() + (a.duration_minutes || 30) * 60000,
    }));

    const dayName = d.format("dddd, MMMM D");

    for (const slot of slots) {
      if (results.length >= count) break;
      const [sh, sm] = slot.start_time.split(":").map(Number);
      const [eh, em] = slot.end_time.split(":").map(Number);

      for (let h = sh; h < eh || (h === eh && 0 < em); h++) {
        if (results.length >= count) break;
        for (let m = h === sh ? sm : 0; m < 60; m += 30) {
          if (results.length >= count) break;
          if (h > eh || (h === eh && m >= em)) break;
          const slotStartMs = appWallClockToUtcMs(dateStr, h, m);
          const slotEndMs = slotStartMs + 30 * 60000;
          const isBusy = busyTimes.some(b => slotStartMs < b.end && slotEndMs > b.start);
          if (!isBusy) {
            const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
            const ampm = h >= 12 ? "PM" : "AM";
            const displayMin = m === 0 ? "00" : String(m);
            results.push({ date: dayName, time: `${displayHour}:${displayMin} ${ampm}` });
          }
        }
      }
    }
  }
  return results;
}

// ─── End of Call Report ──────────────────────────────────────

async function handleEndOfCallReport(message: any) {
  const call = message.call;
  const artifact = message.artifact;
  const endedReason = message.endedReason;

  if (!call?.id) {
    console.warn("[VAPI Webhook] End of call report missing call ID");
    return NextResponse.json({ ok: true });
  }

  // Find the agent by VAPI assistant ID
  const assistantId = call.assistantId;
  let agentId: string | null = null;
  let workspaceId: string | null = null;

  if (assistantId) {
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("id, workspace_id")
      .eq("vapi_assistant_id", assistantId)
      .single();

    if (agent) {
      agentId = agent.id;
      workspaceId = agent.workspace_id;
    }
  }

  // Build transcript from messages
  const transcript: Array<{ role: string; content: string; timestamp: string }> = [];
  if (artifact?.messages) {
    for (const msg of artifact.messages) {
      transcript.push({
        role: msg.role === "bot" || msg.role === "assistant" ? "assistant" : "user",
        content: msg.message || msg.content || "",
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Calculate duration
  const startTime = call.startedAt ? new Date(call.startedAt).getTime() : 0;
  const endTime = call.endedAt ? new Date(call.endedAt).getTime() : Date.now();
  const durationSeconds = startTime ? Math.round((endTime - startTime) / 1000) : 0;

  // Get caller info
  const callerPhone = call.customer?.number || "";

  try {
    // Save conversation to Supabase (matching schema from twilio/incoming)
    const { error } = await supabaseAdmin.from("conversations").insert({
      agent_id: agentId,
      workspace_id: workspaceId,
      modality: "voice",
      channel_id: `vapi-${call.id}`,
      status: "completed",
      from_number: callerPhone || null,
      transcript,
      gathered_data: {},
      conversation_state: {
        vapi_call_id: call.id,
        ended_reason: endedReason,
        voice_provider: "vapi",
        call_duration_seconds: durationSeconds,
        recording_url: artifact?.recordingUrl || null,
        summary: artifact?.transcript || null,
      },
    });

    if (error) {
      console.error("[VAPI Webhook] Failed to save conversation:", error);
    } else {
      console.log(`[VAPI Webhook] Saved conversation for call ${call.id}, agent ${agentId}`);
    }

    if (workspaceId && durationSeconds > 0) {
      recordVoiceUsage({
        workspaceId,
        minutes: durationSeconds / 60,
        source: "vapi",
        metadata: { call_id: call.id, agent_id: agentId, ended_reason: endedReason },
      });
    }

    // Voicemail email — if the model called send_to_voicemail mid-
    // call, we stamped a row in vapi_voicemail_pending. Now we
    // have the recording_url + transcript, send it to the workspace
    // owner. Fire-and-forget; failures must not block the webhook.
    if (workspaceId && call.id) {
      void notifyVoicemailIfPending({
        callId: call.id,
        workspaceId,
        callerPhone,
        recordingUrl: artifact?.recordingUrl || null,
        transcript: artifact?.transcript || transcript.map((t: any) => `${t.role}: ${t.text}`).join("\n"),
      });
    }

    // Dante churn signal — log an agent_interaction event if we can
    // resolve the caller phone to a contact in this workspace. Also
    // the trigger point for the inbound call audit pipeline: once we
    // know we have a real client on the other end, we summarize the
    // transcript, file a "📞 Call with …" note, and surface the whole
    // thing on the client's detail page under CALL AUDITS.
    if (workspaceId && callerPhone) {
      const normalized = normalizePhone(callerPhone) || callerPhone;
      const { data: matchedContact } = await supabaseAdmin
        .from("contacts")
        .select("id, name")
        .eq("workspace_id", workspaceId)
        .eq("phone", normalized)
        .maybeSingle();
      if (matchedContact?.id) {
        // Duration-based classification: long calls usually mean real
        // engagement, quick hang-ups don't. Under 30s is suspicious.
        const eventType =
          durationSeconds < 30 ? "agent_interaction_negative" :
          durationSeconds > 120 ? "agent_interaction_positive" :
          "agent_interaction";
        logChurnEvent({
          workspace_id: workspaceId,
          contact_id: matchedContact.id,
          event_type: eventType,
          source: "vapi",
          source_id: call.id,
          metadata: {
            duration_seconds: durationSeconds,
            ended_reason: endedReason,
            agent_id: agentId,
          },
        });

        // Kick off the audit pipeline. Only for matched contacts with
        // at least some transcript — short/empty hang-ups produce no
        // useful summary and would just clutter the notes list.
        if (transcript.length > 0) {
          await kickoffInboundAudit({
            workspaceId,
            contactId: matchedContact.id,
            contactName: matchedContact.name || "Client",
            vapiCallId: call.id,
            durationSeconds,
            messages: artifact?.messages || [],
            callStartedAt: call.startedAt || null,
          });
        }
      }
    }
  } catch (err) {
    console.error("[VAPI Webhook] Error saving conversation:", err);
  }

  return NextResponse.json({ ok: true });
}

// ─── Inbound Call Audit Pipeline ─────────────────────────────
//
// When an inbound receptionist call ends and we matched the caller to a
// real contact, we generate the same citation-grounded audit that the
// manual "Record call" button produces — just sourced from VAPI's
// transcript artifact instead of a browser-recorded audio blob.
//
// Two phases:
//
//   Phase 1 (synchronous, before webhook response):
//     - Build whisper-style segments from VAPI's message array.
//     - Insert a call_recordings row in status='summarizing' so the
//       "Processing…" state shows up on the client's detail page
//       immediately, before the LLM finishes.
//
//   Phase 2 (async, via `after()` so VAPI gets a fast 200):
//     - Run summarizeCall (same code path as manual recordings).
//     - Scan for compliance flags.
//     - Write the 📞 note + link it back to the recording.
//     - Flip status to 'done' (or 'error' on failure).

type VapiMessage = {
  role?: string;
  message?: string;
  content?: string;
  time?: number;
  secondsFromStart?: number;
  duration?: number;
};

// Convert VAPI's per-turn message list into whisper-style segments
// ({ id, start, end, text }) so the grounded summarizer can cite them.
// Agent/client turns are tagged in the text; the summarizer and the
// audit UI both treat these as opaque quoted evidence.
// Whisper / VAPI transcribers occasionally emit emoji decoder artifacts
// ("😊 🖐️ Bye") on noisy-but-empty audio. Keep 📞 (our own header
// marker), drop everything else — they're never real transcript content.
function stripTranscriberEmojis(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}(?:\u200d\p{Extended_Pictographic})*[\uFE0E\uFE0F]?/gu, "")
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "")
    .replace(/[\uFE0E\uFE0F]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();
}

function buildSegmentsFromMessages(
  messages: VapiMessage[],
  callStartedAt: string | null
): TranscriptSegment[] {
  const callStartMs = callStartedAt ? new Date(callStartedAt).getTime() : 0;
  const segments: TranscriptSegment[] = [];
  let idx = 0;
  for (const m of messages) {
    const role = m.role;
    if (role !== "user" && role !== "bot" && role !== "assistant") continue;
    const raw = stripTranscriberEmojis((m.message || m.content || "").trim());
    if (!raw) continue;
    const label = role === "bot" || role === "assistant" ? "Agent" : "Client";
    const startSec =
      typeof m.secondsFromStart === "number"
        ? m.secondsFromStart
        : typeof m.time === "number" && callStartMs
        ? Math.max(0, (m.time - callStartMs) / 1000)
        : idx * 5;
    // Duration: VAPI reports it in ms when available. Fall back to a
    // rough estimate so citation highlighting has something to span
    // visually even when the artifact is sparse.
    const durationSec =
      typeof m.duration === "number" ? m.duration / 1000 : Math.max(1, raw.length / 20);
    segments.push({
      id: idx,
      start: Math.max(0, startSec),
      end: Math.max(startSec, startSec + durationSec),
      text: `${label}: ${raw}`,
    });
    idx++;
  }
  return segments;
}

async function kickoffInboundAudit(args: {
  workspaceId: string;
  contactId: string;
  contactName: string;
  vapiCallId: string;
  durationSeconds: number;
  messages: VapiMessage[];
  callStartedAt: string | null;
}) {
  const { workspaceId, contactId, contactName, vapiCallId, durationSeconds, messages, callStartedAt } = args;

  const segments = buildSegmentsFromMessages(messages, callStartedAt);
  if (segments.length === 0) return;
  const transcriptText = segments.map((s) => s.text).join("\n");

  // Guard against duplicate audits on webhook retries. VAPI will retry
  // end-of-call-report on 5xx; if the previous attempt already inserted
  // a row for this call_id, skip Phase 1 entirely.
  const { data: existing } = await supabaseAdmin
    .from("call_recordings")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("external_call_id", vapiCallId)
    .maybeSingle();
  if (existing?.id) {
    console.log(`[VAPI Audit] Skipping — audit already exists for call ${vapiCallId}`);
    return;
  }

  const { data: rec, error: recErr } = await supabaseAdmin
    .from("call_recordings")
    .insert({
      workspace_id: workspaceId,
      contact_id: contactId,
      user_id: null, // inbound rows have no originating user (see migration)
      source: "inbound_vapi",
      storage_path: null,
      status: "summarizing",
      transcript: transcriptText,
      transcript_segments: segments,
      duration_seconds: durationSeconds || null,
      external_call_id: vapiCallId,
    })
    .select("id")
    .single();

  if (recErr || !rec) {
    console.error("[VAPI Audit] Failed to insert call_recordings row:", recErr);
    return;
  }

  const recordingId = rec.id;

  // Phase 2 — LLM work after the response is sent to VAPI so they get
  // a fast 200 and don't retry. `after()` respects the route's
  // maxDuration; we budgeted 300s at the top of the file.
  after(async () => {
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!openaiKey && !anthropicKey) {
      await supabaseAdmin
        .from("call_recordings")
        .update({ status: "error", error: "No LLM key configured" })
        .eq("id", recordingId);
      return;
    }

    try {
      // Reference retrieval — regulatory fact grounding. Failures here
      // are non-fatal; the summary just runs without the extra context.
      let referenceContext = "";
      try {
        const chunks = await retrieveReferences(transcriptText);
        if (chunks.length > 0) referenceContext = formatReferenceContext(chunks);
      } catch (e) {
        console.error("[VAPI Audit] reference retrieval failed:", e);
      }

      const { structured, markdown: summary } = await summarizeCall({
        segments,
        transcript: transcriptText,
        contactName,
        openaiKey,
        anthropicKey,
        referenceContext,
      });

      // Compose the note body. "Inbound" marker distinguishes these
      // from advisor-recorded calls in the notes timeline.
      const when = new Date().toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      });
      const durationMin = durationSeconds > 0 ? Math.round(durationSeconds / 60) : null;
      const header = `📞 Call with ${contactName} — ${when}${
        durationMin ? ` (~${durationMin} min)` : ""
      } · Inbound`;
      const noteBody = `${header}\n\n${summary}\n\n---\n\nFULL TRANSCRIPT\n${transcriptText}`;

      const { data: noteRow, error: noteErr } = await supabaseAdmin
        .from("notes")
        .insert({
          workspace_id: workspaceId,
          contact_id: contactId,
          body: noteBody,
        })
        .select("id")
        .single();

      if (noteErr) {
        await supabaseAdmin
          .from("call_recordings")
          .update({ status: "error", error: `note insert failed: ${noteErr.message}` })
          .eq("id", recordingId);
        return;
      }

      // Sentiment classification — feeds Dante's sentiment signal.
      // Non-fatal: null score means Dante falls back to keyword heuristic.
      const sentiment = await classifyCallSentiment({
        summary,
        contactName,
        anthropicKey,
        openaiKey,
      });

      // Per-topic engagement — same module the recorded-call pipeline
      // uses. Vapi segments are prefixed with "Client:" / "Agent:" so
      // the analyzer's role-attribution prompt works without changes.
      const engagement = await analyzeEngagement({
        segments,
        transcript: transcriptText,
        contactName,
        anthropicKey,
        openaiKey,
      });

      await supabaseAdmin
        .from("call_recordings")
        .update({
          status: "done",
          summary,
          summary_structured: structured ?? null,
          note_id: noteRow.id,
          completed_at: new Date().toISOString(),
          sentiment_score: sentiment?.score ?? null,
          sentiment_label: sentiment?.label ?? null,
          engagement: engagement
            ? {
                overall_interest: engagement.overall_interest,
                topics: engagement.topics,
              }
            : null,
        })
        .eq("id", recordingId);

      // Fire Dante churn events for non-medium topics so per-topic
      // interest on inbound calls decays alongside recorded-call signals.
      if (engagement) {
        for (const t of engagement.topics) {
          if (t.interest === "medium") continue;
          logChurnEvent({
            workspace_id: workspaceId,
            contact_id: contactId,
            event_type:
              t.interest === "high"
                ? "topic_high_interest"
                : "topic_low_interest",
            source: "vapi_inbound",
            source_id: recordingId,
            metadata: {
              topic: t.topic.slice(0, 120),
              evidence: t.evidence.slice(0, 200),
              segment_ids: t.segment_ids.slice(0, 8),
            },
          });
        }
      }

      // Compliance auto-scan on the generated summary — same pipeline
      // as manual recordings so FINRA/Reg BI flags surface identically.
      try {
        const scan = await scanForCompliance({
          text: summary,
          contextLabel: `Inbound call summary for ${contactName}`,
          anthropicKey,
        });
        if (scan.flags.length > 0) {
          await supabaseAdmin.from("compliance_flags").insert(
            scan.flags.map((f) => ({
              workspace_id: workspaceId,
              source_type: "call_summary",
              source_id: recordingId,
              scanned_text: summary,
              layer: f.layer,
              rule_id: f.rule_id,
              severity: f.severity,
              message: f.message,
              citation_refs: f.citations,
              status: "pending" as const,
            }))
          );

          // Fire a Dante churn event per "block"-severity flag so the
          // risk surfaces in the churn score, not just the compliance UI.
          const blocks = scan.flags.filter((f) => f.severity === "block");
          for (const f of blocks) {
            logChurnEvent({
              workspace_id: workspaceId,
              contact_id: contactId,
              event_type: "compliance_flag_high",
              source: "vapi",
              source_id: recordingId,
              metadata: {
                rule_id: f.rule_id,
                layer: f.layer,
                message: f.message?.slice(0, 200),
              },
            });
          }
        }
      } catch (e) {
        console.error("[VAPI Audit] compliance scan failed:", e);
      }

      console.log(`[VAPI Audit] Completed audit ${recordingId} for ${contactName}`);
    } catch (e: any) {
      console.error("[VAPI Audit] Pipeline failed:", e);
      await supabaseAdmin
        .from("call_recordings")
        .update({
          status: "error",
          error: e?.message?.slice(0, 500) || "Summarization failed",
        })
        .eq("id", recordingId);
    }
  });
}

// ─── Status Update ───────────────────────────────────────────

async function handleStatusUpdate(message: any) {
  const { status, call } = message;
  console.log(`[VAPI Webhook] Call ${call?.id} status: ${status}`);

  // We primarily care about end-of-call-report for logging
  // Status updates are informational
  return NextResponse.json({ ok: true });
}

// ─── Assistant Request (dynamic routing) ─────────────────────

async function handleAssistantRequest(message: any) {
  // For now, the assistant is pre-configured on the phone number
  // This handler is here for future dynamic routing
  const call = message.call;
  const phoneNumber = call?.phoneNumber?.number;

  if (phoneNumber) {
    // Look up agent by phone number
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("vapi_assistant_id")
      .eq("phone_number", phoneNumber)
      .eq("voice_provider", "vapi")
      .eq("status", "deployed")
      .single();

    if (agent?.vapi_assistant_id) {
      return NextResponse.json({ assistantId: agent.vapi_assistant_id });
    }
  }

  return NextResponse.json({ error: "No assistant configured for this number" });
}

/**
 * If the call had a voicemail flag set mid-call, email the workspace
 * owner with the transcript + recording URL via Resend. Marks the
 * pending row consumed_at so a retry of end-of-call-report (VAPI
 * sometimes redelivers) doesn't double-send.
 */
async function notifyVoicemailIfPending(args: {
  callId: string;
  workspaceId: string;
  callerPhone: string;
  recordingUrl: string | null;
  transcript: string;
}) {
  try {
    const { data: pending } = await supabaseAdmin
      .from("vapi_voicemail_pending")
      .select("vapi_call_id, greeting, consumed_at")
      .eq("vapi_call_id", args.callId)
      .maybeSingle();
    if (!pending) return;
    if (pending.consumed_at) return; // already emailed

    // Resolve workspace owner email via Supabase Auth (email lives
    // there, not on the profiles row).
    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("name, owner_id")
      .eq("id", args.workspaceId)
      .maybeSingle();
    if (!ws?.owner_id) {
      console.warn(`[VAPI Voicemail] No owner_id for workspace ${args.workspaceId}`);
      return;
    }
    const { data: ownerAuth } = await supabaseAdmin.auth.admin.getUserById(ws.owner_id);
    const to = ownerAuth?.user?.email ?? null;
    if (!to) {
      console.warn(`[VAPI Voicemail] No advisor email for workspace ${args.workspaceId}`);
      return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("[VAPI Voicemail] RESEND_API_KEY not set; skipping email");
      return;
    }

    // Trim transcript to a sane preview length for the email body;
    // full transcript is on the conversation row already.
    const preview = (args.transcript || "").slice(0, 1500);
    const phoneLabel = args.callerPhone || "Unknown caller";
    const subject = `Voicemail from ${phoneLabel}`;
    const lines = [
      `New voicemail received via ${ws.name || "Drift"}.`,
      ``,
      `From: ${phoneLabel}`,
      args.recordingUrl ? `Recording: ${args.recordingUrl}` : "Recording: (not available)",
      ``,
      `--- Transcript ---`,
      preview || "(no transcript captured)",
    ].join("\n");

    const fromEmail = process.env.RESEND_FROM_EMAIL || "Drift <ops@driftai.studio>";
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      text: lines,
    });

    await supabaseAdmin
      .from("vapi_voicemail_pending")
      .update({ consumed_at: new Date().toISOString() })
      .eq("vapi_call_id", args.callId);
  } catch (e) {
    console.error("[VAPI Voicemail] notify failed:", e);
  }
}

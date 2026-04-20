/**
 * VAPI Server URL Webhook
 * Handles events from VAPI during voice calls:
 * - tool-calls: Execute scheduling functions
 * - end-of-call-report: Log conversation to Supabase
 * - status-update: Track call status
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { naiveLocalIsoToUtcIso, appDayRangeUtcIso, appWallClockToUtcMs, getAppTimezone } from "@/lib/app-timezone";
import { recordVoiceUsage } from "@/lib/usage/track";
import { logChurnEvent } from "@/lib/dante/churn-events";
import { normalizePhone } from "@/lib/phone";
import dayjs from "dayjs";

export const dynamic = "force-dynamic";

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

    // Dante churn signal — log an agent_interaction event if we can
    // resolve the caller phone to a contact in this workspace.
    if (workspaceId && callerPhone) {
      const normalized = normalizePhone(callerPhone) || callerPhone;
      const { data: matchedContact } = await supabaseAdmin
        .from("contacts")
        .select("id")
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
      }
    }
  } catch (err) {
    console.error("[VAPI Webhook] Error saving conversation:", err);
  }

  return NextResponse.json({ ok: true });
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

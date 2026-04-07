/**
 * VAPI Server URL Webhook
 * Handles events from VAPI during voice calls:
 * - tool-calls: Execute scheduling functions
 * - end-of-call-report: Log conversation to Supabase
 * - status-update: Track call status
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

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

  // The AI sends local time (e.g. "2026-02-19T14:00:00" = 2 PM local).
  // We must convert to UTC for Supabase, since the calendar converts UTC back to local.
  // EST = UTC-5, EDT = UTC-4. Use Intl to get the correct offset.
  let scheduledAt = rawScheduledAt;
  if (scheduledAt && !scheduledAt.includes("Z") && !scheduledAt.includes("+") && !/T\d{2}:\d{2}:\d{2}-/.test(scheduledAt)) {
    const tz = process.env.APP_TIMEZONE || "America/New_York";
    try {
      // Parse the date parts
      const d = new Date(scheduledAt + "Z"); // treat as UTC temporarily
      // Get the UTC offset for this timezone at this date
      const formatter = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" });
      const parts = formatter.formatToParts(d);
      const tzPart = parts.find(p => p.type === "timeZoneName");
      // tzPart.value is like "GMT-5" or "GMT-4"
      if (tzPart) {
        const match = tzPart.value.match(/GMT([+-]?\d+)/);
        if (match) {
          const offsetHours = parseInt(match[1]);
          // Convert: if local time is 2 PM EST (UTC-5), UTC is 2 PM + 5 = 7 PM UTC
          const utcDate = new Date(d.getTime() - offsetHours * 3600000);
          scheduledAt = utcDate.toISOString();
          console.log(`[VAPI Schedule] Timezone conversion: ${rawScheduledAt} (${tz}, GMT${offsetHours >= 0 ? "+" : ""}${offsetHours}) → ${scheduledAt}`);
        }
      }
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
      return JSON.stringify({
        success: true,
        message: `There are no open slots on ${date}. The consultant hasn't opened any availability for that day. Would you like to check a different date?`,
      });
    }

    // 2. Get existing appointments to subtract from open slots
    const { data: existingAppts } = await supabaseAdmin
      .from("appointments")
      .select("scheduled_at, duration_minutes")
      .eq("workspace_id", agent.workspace_id)
      .gte("scheduled_at", `${date}T00:00:00`)
      .lte("scheduled_at", `${date}T23:59:59`)
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
          
          const slotStart = new Date(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
          const slotEnd = new Date(slotStart.getTime() + 30 * 60000);

          const isBusy = busyTimes.some((b) => slotStart.getTime() < b.end && slotEnd.getTime() > b.start);
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
      return JSON.stringify({
        success: true,
        message: `All open slots on ${date} are already booked. Would you like to check a different date?`,
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

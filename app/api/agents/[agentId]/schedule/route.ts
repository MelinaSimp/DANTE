/**
 * Agent Schedule API
 * Create appointments from agent conversations
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import twilio from "twilio";
import { naiveLocalIsoToUtcIso, appDayRangeUtcIso, appWallClockToUtcMs, getAppTimezone } from "@/lib/app-timezone";
import dayjs from "dayjs";
import { decryptSecret } from "@/lib/crypto/secrets";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!(await rateLimit(`schedule:${ip}`, 10)).allowed) return rateLimitResponse();

    const body = await req.json();
    const {
      contactName,
      contactPhone,
      contactEmail,
      scheduledAt,
      serviceType,
      durationMinutes = 60,
      notes,
      fromNumber, // For voice calls
    } = body;

    if (!contactName || !contactPhone || !scheduledAt || !serviceType) {
      return NextResponse.json(
        { error: "Missing required fields: contactName, contactPhone, scheduledAt, serviceType" },
        { status: 400 }
      );
    }

    // Get agent and workspace - supports both user auth and agent-based calls
    let workspaceId: string;
    
    // First, try to get agent to get workspace
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("id, workspace_id")
      .eq("id", agentId)
      .single();

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    workspaceId = agent.workspace_id;

    // If user is authenticated, verify agent belongs to their workspace
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("workspace_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.workspace_id && profile.workspace_id !== workspaceId) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      }
    }

    // Normalize phone number
    const normalizedPhone = normalizePhone(contactPhone || fromNumber);
    if (!normalizedPhone) {
      return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 });
    }

    // Try to match the caller to an existing contact. If we find one,
    // the appointment attaches to that contact; if we don't, we
    // deliberately leave contact_id NULL and stash the heard name on
    // the appointment itself. See migration
    // 20260421000000_appointments_unknown_callers.sql for the
    // reasoning — briefly: auto-creating contacts for every cold
    // caller polluted the Contacts list, so we now require an
    // explicit "Promote to client" action from the advisor.
    //
    // We also no longer overwrite an existing contact's name/email
    // when a phone match succeeds. Twilio's ASR mishears names and
    // email addresses constantly ("Justin" → "Justice", "j@gmail"
    // → "jay at g mail"), and silently corrupting manually-entered
    // client data on every call is worse than ignoring the spoken
    // values. If the advisor wants to update a contact's name or
    // email they can edit it directly on the client record.
    let contactId: string | null = null;
    const { data: existingContact } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("phone", normalizedPhone)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
    }

    const scheduledAtUtc = naiveLocalIsoToUtcIso(String(scheduledAt));

    // Validate scheduled_at is not in the past
    const scheduledDate = new Date(scheduledAtUtc);
    if (scheduledDate < new Date()) {
      return NextResponse.json(
        { error: "Appointment time cannot be in the past" },
        { status: 400 }
      );
    }

    // Check for conflicts (optional - can be enhanced)
    const { data: conflicts } = await supabaseAdmin
      .from("appointments")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date(scheduledDate.getTime() + (durationMinutes * 60000)).toISOString())
      .gte("scheduled_at", new Date(scheduledDate.getTime() - (durationMinutes * 60000)).toISOString());

    if (conflicts && conflicts.length > 0) {
      return NextResponse.json(
        { error: "Time slot is already booked", conflicts: conflicts.length },
        { status: 409 }
      );
    }

    // Create appointment. When contact_id is null we stash the heard
    // name + normalised phone on the appointment itself so the UI has
    // something to show ("Unknown · +1 555… (said: John)"). If the
    // advisor later promotes this caller to a contact, these fields
    // get cleared and contact_id gets backfilled — see
    // /api/appointments/[id]/promote.
    const { data: appointment, error: appointmentError } = await supabaseAdmin
      .from("appointments")
      .insert({
        workspace_id: workspaceId,
        contact_id: contactId,
        caller_name: contactId ? null : (contactName || null),
        caller_phone: contactId ? null : normalizedPhone,
        scheduled_at: scheduledAtUtc,
        duration_minutes: durationMinutes,
        service_type: serviceType,
        status: "scheduled",
        notes: notes || null,
      })
      .select(`
        id,
        scheduled_at,
        duration_minutes,
        service_type,
        status,
        notes,
        caller_name,
        caller_phone,
        contacts (
          id,
          name,
          phone,
          email
        )
      `)
      .single();

    if (appointmentError || !appointment) {
      console.error("Appointment creation error:", appointmentError);
      return NextResponse.json(
        { error: "Failed to create appointment" },
        { status: 500 }
      );
    }

    // Generate AI message for SMS reminder
    const aiMessage = await generateAppointmentReminderMessage({
      name: contactName,
      description: serviceType,
      scheduledAt: scheduledAtUtc,
      durationMinutes,
    });

    // Send immediate SMS reminder (for testing - sends immediately regardless of appointment time)
    try {
      await sendAppointmentSMS(normalizedPhone, aiMessage, workspaceId, agentId);
      console.log(`[Agent Schedule] Immediate SMS reminder sent to ${normalizedPhone} for appointment on ${scheduledAtUtc}`);
    } catch (smsError: any) {
      console.error("Failed to send SMS reminder:", smsError);
      // Don't fail the appointment creation if SMS fails
    }

    return NextResponse.json({
      success: true,
      appointment,
    });
  } catch (error: any) {
    console.error("Schedule API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Get available time slots
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    // Get workspace - supports both user auth and agent-based calls
    let workspaceId: string;
    
    // First, try to get agent to get workspace
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("id, workspace_id")
      .eq("id", agentId)
      .maybeSingle();

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    workspaceId = agent.workspace_id;

    // Try to verify user auth (optional - for UI calls)
    try {
      const supabase = await createServerSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // User is authenticated, verify they have access to this workspace
        const { data: profile } = await supabase
          .from("profiles")
          .select("workspace_id")
          .eq("id", user.id)
          .maybeSingle();

        if (profile?.workspace_id && profile.workspace_id !== workspaceId) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }
      }
      // If no user, continue with agent-based auth (workspace already verified from agent)
    } catch (authError) {
      // Auth check failed, continue with agent-based auth
      console.log("[Schedule GET] No user session, using agent-based auth");
    }

    const { searchParams } = new URL(req.url);
    const tz = getAppTimezone();
    const date =
      searchParams.get("date") || dayjs().tz(tz).format("YYYY-MM-DD");
    const duration = parseInt(searchParams.get("duration") || "60");

    const { startUtcIso, endExclusiveUtcIso } = appDayRangeUtcIso(date);

    const { data: existingAppointments } = await supabaseAdmin
      .from("appointments")
      .select("scheduled_at, duration_minutes")
      .eq("workspace_id", workspaceId)
      .eq("status", "scheduled")
      .gte("scheduled_at", startUtcIso)
      .lt("scheduled_at", endExclusiveUtcIso);

    // Generate available slots (9 AM – 5 PM app-local, 30-minute intervals) as UTC ISO strings
    const availableSlots: string[] = [];
    const startHour = 9;
    const endHour = 17;
    const intervalMinutes = 30;
    const now = Date.now();

    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += intervalMinutes) {
        const slotStartMs = appWallClockToUtcMs(date, hour, minute);
        const slotEndMs = slotStartMs + duration * 60000;

        const hasConflict = existingAppointments?.some((apt) => {
          const aptStart = new Date(apt.scheduled_at).getTime();
          const aptEnd = aptStart + (apt.duration_minutes || 60) * 60000;
          return slotStartMs < aptEnd && slotEndMs > aptStart;
        });

        if (!hasConflict && slotStartMs > now) {
          availableSlots.push(new Date(slotStartMs).toISOString());
        }
      }
    }

    return NextResponse.json({
      date,
      availableSlots,
      existingAppointments: existingAppointments || [],
    });
  } catch (error: any) {
    console.error("Schedule availability error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Generate AI-powered appointment reminder message
 */
async function generateAppointmentReminderMessage({
  name,
  description,
  scheduledAt,
  durationMinutes,
}: {
  name: string;
  description: string;
  scheduledAt: string;
  durationMinutes: number;
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Fallback message if OpenAI not configured
    const date = new Date(scheduledAt);
    const formattedDate = date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    return `Hi ${name}! This is a reminder about your appointment: ${description} scheduled for ${formattedDate}. We look forward to seeing you!`;
  }

  try {
    const date = new Date(scheduledAt);
    const formattedDate = date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a friendly appointment reminder assistant. Write concise, warm SMS messages (under 160 characters) to remind people about their appointments. Be professional but friendly.",
          },
          {
            role: "user",
            content: `Generate a friendly SMS reminder for ${name} about their appointment: "${description}" scheduled for ${formattedDate} (duration: ${durationMinutes} minutes). Keep it short and personal.`,
          },
        ],
        temperature: 0.7,
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      throw new Error("OpenAI API error");
    }

    const data = await response.json();
    const message = data.choices[0]?.message?.content?.trim() || "";

    // Fallback if message is too long or empty
    if (!message || message.length > 200) {
      return `Hi ${name}! Reminder: ${description} on ${formattedDate}. See you then!`;
    }

    return message;
  } catch (error) {
    console.error("Error generating AI message:", error);
    // Fallback message
    const date = new Date(scheduledAt);
    const formattedDate = date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    return `Hi ${name}! Reminder: ${description} on ${formattedDate}. We look forward to seeing you!`;
  }
}

/**
 * Send SMS via Twilio
 */
async function sendAppointmentSMS(
  phoneNumber: string,
  message: string,
  workspaceId: string,
  agentId: string
): Promise<void> {
  // Get Twilio credentials
  const { data: twilioCreds } = await supabaseAdmin
    .from("twilio_credentials")
    .select("account_sid, auth_token")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  let accountSid: string | null = null;
  let authToken: string | null = null;

  if (twilioCreds?.account_sid && twilioCreds?.auth_token) {
    accountSid = twilioCreds.account_sid;
    // auth_token encrypted at rest; decryptSecret handles legacy plaintext too.
    authToken = decryptSecret(twilioCreds.auth_token);
  } else {
    // Fallback to environment variables
    accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_MASTER_ACCOUNT_SID || null;
    authToken = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_MASTER_AUTH_TOKEN || null;
  }

  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not found");
  }

  // Get agent phone number (for "from" number)
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("phone_number")
    .eq("id", agentId)
    .not("phone_number", "is", null)
    .maybeSingle();

  if (!agent?.phone_number) {
    throw new Error("No agent phone number found");
  }

  // Send SMS
  const client = twilio(accountSid, authToken);
  await client.messages.create({
    body: message,
    from: agent.phone_number,
    to: phoneNumber,
  });
}









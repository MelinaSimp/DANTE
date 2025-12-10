import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import twilio from "twilio";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Create appointment and send immediate SMS reminder
 * POST /api/appointments
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, phoneNumber, description, scheduledAt, durationMinutes = 60 } = body;

    if (!name || !phoneNumber || !description || !scheduledAt) {
      return NextResponse.json(
        { error: "Missing required fields: name, phoneNumber, description, scheduledAt" },
        { status: 400 }
      );
    }

    // Get workspace
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Normalize phone number
    const normalizedPhone = normalizePhone(phoneNumber);
    if (!normalizedPhone) {
      return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 });
    }

    // Validate scheduled_at is not in the past
    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate < new Date()) {
      return NextResponse.json(
        { error: "Appointment time cannot be in the past" },
        { status: 400 }
      );
    }

    // Find or create contact
    let contactId: string;
    const { data: existingContact } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("workspace_id", profile.workspace_id)
      .eq("phone", normalizedPhone)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
      // Update contact name if provided
      if (name) {
        await supabaseAdmin
          .from("contacts")
          .update({ name })
          .eq("id", contactId);
      }
    } else {
      // Create new contact
      const { data: newContact, error: contactError } = await supabaseAdmin
        .from("contacts")
        .insert({
          workspace_id: profile.workspace_id,
          name,
          phone: normalizedPhone,
        })
        .select("id")
        .single();

      if (contactError || !newContact) {
        return NextResponse.json(
          { error: "Failed to create contact" },
          { status: 500 }
        );
      }
      contactId = newContact.id;
    }

    // Create appointment
    const { data: appointment, error: appointmentError } = await supabaseAdmin
      .from("appointments")
      .insert({
        workspace_id: profile.workspace_id,
        contact_id: contactId,
        scheduled_at: scheduledAt,
        duration_minutes: durationMinutes,
        service_type: description, // Using description as service_type
        status: "scheduled",
        notes: description,
      })
      .select(`
        id,
        scheduled_at,
        duration_minutes,
        service_type,
        status,
        notes,
        contacts (
          id,
          name,
          phone
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
      name,
      description,
      scheduledAt,
      durationMinutes,
    });

    // Send immediate SMS reminder
    try {
      await sendAppointmentSMS(normalizedPhone, aiMessage, profile.workspace_id);
    } catch (smsError: any) {
      console.error("Failed to send SMS reminder:", smsError);
      // Don't fail the appointment creation if SMS fails
    }

    return NextResponse.json({
      success: true,
      appointment,
    });
  } catch (error: any) {
    console.error("Appointment API error:", error);
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
  workspaceId: string
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
    authToken = twilioCreds.auth_token;
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
    .eq("workspace_id", workspaceId)
    .not("phone_number", "is", null)
    .limit(1)
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


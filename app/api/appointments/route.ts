import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import twilio from "twilio";
import { Resend } from "resend";
import { emitEvent } from "@/lib/automations";
import { logChurnEvent } from "@/lib/dante/churn-events";
import { decryptSecret } from "@/lib/crypto/secrets";
import { complete as llmComplete } from "@/lib/llm/client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function getWorkspace(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { workspaceId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  return { workspaceId: profile?.workspace_id ?? null };
}

/**
 * Get all appointments for the user's workspace
 * GET /api/appointments
 */
export async function GET(req: NextRequest) {
  const { workspaceId } = await getWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("appointments")
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
    .eq("workspace_id", workspaceId)
    .order("scheduled_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch appointments", error);
    return NextResponse.json({ error: "Failed to fetch appointments" }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

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
    const { name, phoneNumber, email, description, scheduledAt, durationMinutes = 60, reminderTiming = [], reminderChannels = { sms: true, email: false } } = body;

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
      // Update contact name and email if provided
      const updateData: any = {};
      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (Object.keys(updateData).length > 0) {
        await supabaseAdmin
          .from("contacts")
          .update(updateData)
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
          email: email || null,
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

    // Fire-and-forget engagement signal for Dante churn.
    logChurnEvent({
      workspace_id: profile.workspace_id,
      contact_id: contactId,
      event_type: "appointment_scheduled",
      source: "appointments",
      source_id: appointment.id,
      metadata: {
        scheduled_at: scheduledAt,
        duration_minutes: durationMinutes,
        service_type: description,
      },
    });

    // Generate AI message for SMS reminder
    const aiMessage = await generateAppointmentReminderMessage({
      name,
      description,
      scheduledAt,
      durationMinutes,
    });

    // Get agent for SMS sending
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("id, phone_number")
      .eq("workspace_id", profile.workspace_id)
      .not("phone_number", "is", null)
      .limit(1)
      .maybeSingle();

    // Schedule SMS reminders based on selected timing
    const appointmentDate = new Date(scheduledAt);
    const reminderTimings: { value: string; minutes: number }[] = [];
    
    if (reminderTiming.includes("immediate")) {
      reminderTimings.push({ value: "immediate", minutes: 0 });
    }
    if (reminderTiming.includes("1_day")) {
      reminderTimings.push({ value: "1_day", minutes: 24 * 60 });
    }
    if (reminderTiming.includes("5_hours")) {
      reminderTimings.push({ value: "5_hours", minutes: 5 * 60 });
    }
    if (reminderTiming.includes("1_hour")) {
      reminderTimings.push({ value: "1_hour", minutes: 60 });
    }

    // Default to immediate if no timing selected
    if (reminderTimings.length === 0) {
      reminderTimings.push({ value: "immediate", minutes: 0 });
    }

    let smsError: any = null;
    let emailError: any = null;
    let smsSuccess = false;
    let emailSuccess = false;
    let scheduledCount = 0;

    // Always send a confirmation email immediately when email channel is enabled
    if (reminderChannels.email && email && agent) {
      try {
        await sendAppointmentEmail(email, {
          name,
          description,
          scheduledAt: appointmentDate.toISOString(),
          durationMinutes,
        }, profile.workspace_id);
        emailSuccess = true;
        console.log(`[Appointment] Confirmation email sent to ${email}`);

        await supabaseAdmin.from("sent_emails").insert({
          workspace_id: profile.workspace_id,
          sender_id: user.id,
          to_email: email,
          subject: `Appointment Reminder: ${description}`,
        });
      } catch (err: any) {
        emailError = err;
        console.error("[Appointment] Failed to send confirmation email:", err);
      }
    }

    if (reminderTimings.length > 0 && agent) {
      try {
        for (const { value, minutes } of reminderTimings) {
          const reminderDate = new Date(appointmentDate.getTime() - minutes * 60 * 1000);
          
          // For immediate, send right away (skip if we already sent confirmation above)
          if (value === "immediate") {
            // Send SMS if enabled
            if (reminderChannels.sms) {
              try {
                await sendAppointmentSMS(normalizedPhone, aiMessage, profile.workspace_id);
                smsSuccess = true;
                console.log(`[Appointment] Immediate SMS reminder sent to ${normalizedPhone}`);
              } catch (err: any) {
                smsError = err;
                console.error("[Appointment] Failed to send immediate SMS:", err);
              }
            }
            
            // Send Email if enabled and email is provided
            if (reminderChannels.email && email) {
              try {
                await sendAppointmentEmail(email, {
                  name,
                  description,
                  scheduledAt: appointmentDate.toISOString(),
                  durationMinutes,
                }, profile.workspace_id);
                emailSuccess = true;
                console.log(`[Appointment] Immediate email reminder sent to ${email}`);
              } catch (err: any) {
                emailError = err;
                console.error("[Appointment] Failed to send immediate email:", err);
              }
            }
          } else {
            // For scheduled reminders
            if (reminderDate > new Date()) {
              // Schedule SMS if enabled
              if (reminderChannels.sms) {
                const { error: scheduleError } = await supabaseAdmin
                  .from("scheduled_sms")
                  .insert({
                    workspace_id: profile.workspace_id,
                    agent_id: agent.id,
                    phone_number: normalizedPhone,
                    message: aiMessage,
                    scheduled_at: reminderDate.toISOString(),
                    status: "pending",
                    metadata: {
                      appointment_id: appointment.id,
                      reminder_type: value,
                    },
                  });

                if (!scheduleError) {
                  scheduledCount++;
                  console.log(`[Appointment] Scheduled ${value} SMS reminder for ${reminderDate.toISOString()}`);
                } else {
                  console.error(`[Appointment] Failed to schedule ${value} SMS reminder:`, scheduleError);
                }
              }
              
              // Schedule Email if enabled and email is provided
              if (reminderChannels.email && email) {
                const { error: emailScheduleError } = await supabaseAdmin
                  .from("scheduled_emails")
                  .insert({
                    workspace_id: profile.workspace_id,
                    agent_id: agent.id,
                    to_email: email,
                    subject: `Appointment Reminder: ${description}`,
                    html_content: generateEmailContent({
                      name,
                      description,
                      scheduledAt: appointmentDate.toISOString(),
                      durationMinutes,
                    }),
                    scheduled_at: reminderDate.toISOString(),
                    status: "pending",
                    metadata: {
                      appointment_id: appointment.id,
                      reminder_type: value,
                    },
                  });

                if (!emailScheduleError) {
                  scheduledCount++;
                  console.log(`[Appointment] Scheduled ${value} email reminder for ${reminderDate.toISOString()}`);
                } else {
                  console.error(`[Appointment] Failed to schedule ${value} email reminder:`, emailScheduleError);
                }
              }
            }
          }
        }
      } catch (err: any) {
        smsError = err;
        emailError = err;
        console.error("[Appointment] Failed to schedule reminders:", err);
      }
    } else if (!agent) {
      console.error("[Appointment] No agent found for reminder sending");
    }

    emitEvent("appointment.booked", {
      appointment_id: appointment.id,
      contact_name: name,
      scheduled_at: scheduledAt,
      description,
    });

    return NextResponse.json({
      success: true,
      appointment,
      smsSent: smsSuccess,
      emailSent: emailSuccess,
      scheduledCount,
      smsError: smsError ? smsError.message : null,
      emailError: emailError ? emailError.message : null,
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
export async function generateAppointmentReminderMessage({
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

    const result = await llmComplete({
      model: "claude-haiku-4-5-20251001",
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
      maxTokens: 100,
      feature: "appointments.parse",
    });

    const message = (typeof result.message.content === "string" ? result.message.content : "").trim();

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
export async function sendAppointmentSMS(
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
    .eq("workspace_id", workspaceId)
    .not("phone_number", "is", null)
    .limit(1)
    .maybeSingle();

  if (!agent?.phone_number) {
    throw new Error("No agent phone number found");
  }

  // Send SMS
  const client = twilio(accountSid, authToken);
  const twilioMessage = await client.messages.create({
    body: message,
    from: agent.phone_number,
    to: phoneNumber,
  });
  
  console.log(`[sendAppointmentSMS] Twilio message created:`, {
    sid: twilioMessage.sid,
    status: twilioMessage.status,
    to: twilioMessage.to,
    from: twilioMessage.from,
    body: message.substring(0, 50) + '...',
  });
  
  // Check if message was queued successfully
  if (!twilioMessage.sid) {
    throw new Error("Twilio message SID not returned - message may not have been sent");
  }
}

/**
 * Generate HTML email content for appointment reminder
 */
export function generateEmailContent({
  name,
  description,
  scheduledAt,
  durationMinutes,
}: {
  name: string;
  description: string;
  scheduledAt: string;
  durationMinutes: number;
}): string {
  const date = new Date(scheduledAt);
  const formattedDate = date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const formattedTime = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Appointment Reminder</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
          <h2 style="color: #333; margin-top: 0;">Appointment Reminder</h2>
          <p>Hi ${name},</p>
          <p>This is a reminder about your upcoming appointment:</p>
          <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 10px 0;"><strong>Service:</strong> ${description}</p>
            <p style="margin: 10px 0;"><strong>Date:</strong> ${formattedDate}</p>
            <p style="margin: 10px 0;"><strong>Time:</strong> ${formattedTime}</p>
            <p style="margin: 10px 0;"><strong>Duration:</strong> ${durationMinutes} minutes</p>
          </div>
          <p>We look forward to seeing you!</p>
          <p style="margin-top: 30px; color: #666; font-size: 14px;">
            If you need to reschedule or cancel, please contact us as soon as possible.
          </p>
        </div>
      </body>
    </html>
  `;
}

/**
 * Send email reminder via Resend
 */
export async function sendAppointmentEmail(
  toEmail: string,
  appointmentData: {
    name: string;
    description: string;
    scheduledAt: string;
    durationMinutes: number;
  },
  workspaceId: string
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY not configured");
  }

  const resend = new Resend(resendApiKey);

  // Get workspace or agent info for "from" email
  const { data: workspace } = await supabaseAdmin
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .maybeSingle();

  const rawFrom = process.env.RESEND_FROM_EMAIL || "noreply@driftai.studio";
  // If RESEND_FROM_EMAIL already has "Name <email>" format, use it directly
  // Otherwise wrap it with workspace name
  const fromField = rawFrom.includes("<")
    ? rawFrom
    : `${workspace?.name || "Drift AI"} <${rawFrom}>`;

  const result = await resend.emails.send({
    from: fromField,
    to: [toEmail],
    subject: `Appointment Reminder: ${appointmentData.description}`,
    html: generateEmailContent(appointmentData),
  });

  if (result.error) {
    console.error("[sendAppointmentEmail] Resend API error:", JSON.stringify(result.error));
    throw new Error(`Resend API error: ${result.error.message || JSON.stringify(result.error)}`);
  }

  if (!result.data?.id) {
    throw new Error("Resend email ID not returned - email may not have been sent");
  }

  // email sent successfully
}


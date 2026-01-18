import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateAppointmentReminderMessage, sendAppointmentSMS, sendAppointmentEmail, generateEmailContent } from "../../route";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Update appointment reminder timings
 * PATCH /api/appointments/[id]/reminders
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const appointmentId = params.id;
    const body = await req.json();
    const { reminderTiming = [], reminderChannels = { sms: true, email: false } } = body;

    // Get workspace
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Get appointment with contact info
    const { data: appointment, error: appointmentError } = await supabaseAdmin
      .from("appointments")
      .select(`
        id,
        scheduled_at,
        duration_minutes,
        service_type,
        contacts (
          id,
          name,
          phone,
          email
        )
      `)
      .eq("id", appointmentId)
      .eq("workspace_id", profile.workspace_id)
      .single();

    if (appointmentError || !appointment) {
      return NextResponse.json(
        { error: "Appointment not found" },
        { status: 404 }
      );
    }

    // Get agent for SMS sending
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("id, phone_number")
      .eq("workspace_id", profile.workspace_id)
      .not("phone_number", "is", null)
      .limit(1)
      .maybeSingle();

    if (!agent) {
      return NextResponse.json(
        { error: "No agent found for SMS sending" },
        { status: 400 }
      );
    }

    // Delete existing scheduled reminders for this appointment
    await supabaseAdmin
      .from("scheduled_sms")
      .delete()
      .eq("workspace_id", profile.workspace_id)
      .eq("metadata->>appointment_id", appointmentId);
    
    await supabaseAdmin
      .from("scheduled_emails")
      .delete()
      .eq("workspace_id", profile.workspace_id)
      .eq("metadata->>appointment_id", appointmentId);

    // Generate AI message for SMS reminder
    const aiMessage = await generateAppointmentReminderMessage({
      name: appointment.contacts.name,
      description: appointment.service_type,
      scheduledAt: appointment.scheduled_at,
      durationMinutes: appointment.duration_minutes,
    });

    // Schedule new reminders based on selected timing
    const appointmentDate = new Date(appointment.scheduled_at);
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

    let scheduledCount = 0;
    let immediateSent = false;

    for (const { value, minutes } of reminderTimings) {
      const reminderDate = new Date(appointmentDate.getTime() - minutes * 60 * 1000);
      
      // For immediate, send right away (only if appointment is in the future)
      if (value === "immediate" && appointmentDate > new Date()) {
        // Send SMS if enabled
        if (reminderChannels.sms) {
          try {
            await sendAppointmentSMS(
              appointment.contacts.phone,
              aiMessage,
              profile.workspace_id
            );
            immediateSent = true;
            console.log(`[Appointment Reminders] Immediate SMS sent to ${appointment.contacts.phone}`);
          } catch (err: any) {
            console.error("[Appointment Reminders] Failed to send immediate SMS:", err);
          }
        }
        
        // Send Email if enabled and email is provided
        if (reminderChannels.email && appointment.contacts.email) {
          try {
            await sendAppointmentEmail(
              appointment.contacts.email,
              {
                name: appointment.contacts.name,
                description: appointment.service_type,
                scheduledAt: appointment.scheduled_at,
                durationMinutes: appointment.duration_minutes,
              },
              profile.workspace_id
            );
            immediateSent = true;
            console.log(`[Appointment Reminders] Immediate email sent to ${appointment.contacts.email}`);
          } catch (err: any) {
            console.error("[Appointment Reminders] Failed to send immediate email:", err);
          }
        }
      } else if (value !== "immediate") {
        // For scheduled reminders
        if (reminderDate > new Date()) {
          // Schedule SMS if enabled
          if (reminderChannels.sms) {
            const { error: scheduleError } = await supabaseAdmin
              .from("scheduled_sms")
              .insert({
                workspace_id: profile.workspace_id,
                agent_id: agent.id,
                phone_number: appointment.contacts.phone,
                message: aiMessage,
                scheduled_at: reminderDate.toISOString(),
                status: "pending",
                metadata: {
                  appointment_id: appointmentId,
                  reminder_type: value,
                },
              });

            if (!scheduleError) {
              scheduledCount++;
              console.log(`[Appointment Reminders] Scheduled ${value} SMS reminder for ${reminderDate.toISOString()}`);
            } else {
              console.error(`[Appointment Reminders] Failed to schedule ${value} SMS reminder:`, scheduleError);
            }
          }
          
          // Schedule Email if enabled and email is provided
          if (reminderChannels.email && appointment.contacts.email) {
            const { error: emailScheduleError } = await supabaseAdmin
              .from("scheduled_emails")
              .insert({
                workspace_id: profile.workspace_id,
                agent_id: agent.id,
                to_email: appointment.contacts.email,
                subject: `Appointment Reminder: ${appointment.service_type}`,
                html_content: generateEmailContent({
                  name: appointment.contacts.name,
                  description: appointment.service_type,
                  scheduledAt: appointment.scheduled_at,
                  durationMinutes: appointment.duration_minutes,
                }),
                scheduled_at: reminderDate.toISOString(),
                status: "pending",
                metadata: {
                  appointment_id: appointmentId,
                  reminder_type: value,
                },
              });

            if (!emailScheduleError) {
              scheduledCount++;
              console.log(`[Appointment Reminders] Scheduled ${value} email reminder for ${reminderDate.toISOString()}`);
            } else {
              console.error(`[Appointment Reminders] Failed to schedule ${value} email reminder:`, emailScheduleError);
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      immediateSent,
      scheduledCount,
      reminderTiming,
    });
  } catch (error: any) {
    console.error("Appointment reminders API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Get existing reminder timings for an appointment
 * GET /api/appointments/[id]/reminders
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const appointmentId = params.id;

    // Get workspace
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Get scheduled reminders for this appointment
    const { data: scheduledReminders, error } = await supabaseAdmin
      .from("scheduled_sms")
      .select("metadata, scheduled_at, status")
      .eq("workspace_id", profile.workspace_id)
      .eq("metadata->>appointment_id", appointmentId)
      .in("status", ["pending", "sent"]);

    if (error) {
      console.error("Error fetching reminders:", error);
      return NextResponse.json({ reminderTiming: [] });
    }

    // Extract reminder types from metadata
    const reminderTiming: string[] = [];
    if (scheduledReminders) {
      for (const reminder of scheduledReminders) {
        const reminderType = reminder.metadata?.reminder_type;
        if (reminderType && !reminderTiming.includes(reminderType)) {
          reminderTiming.push(reminderType);
        }
      }
    }

    // Check if immediate was sent (by checking if there's a sent SMS close to appointment time)
    // For now, we'll assume immediate is included if no scheduled reminders exist
    // This is a simplification - in production you might want to track this better
    if (scheduledReminders && scheduledReminders.length === 0) {
      reminderTiming.push("immediate");
    }

    return NextResponse.json({ reminderTiming });
  } catch (error: any) {
    console.error("Get reminders API error:", error);
    return NextResponse.json({ reminderTiming: [] });
  }
}


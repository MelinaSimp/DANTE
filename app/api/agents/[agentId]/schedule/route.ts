/**
 * Agent Schedule API
 * Create appointments from agent conversations
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { agentId: string } }
) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      contactName,
      contactPhone,
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

    // Get workspace
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Verify agent belongs to workspace
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("id, workspace_id")
      .eq("id", params.agentId)
      .eq("workspace_id", profile.workspace_id)
      .single();

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Normalize phone number
    const normalizedPhone = normalizePhone(contactPhone || fromNumber);
    if (!normalizedPhone) {
      return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 });
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
      if (contactName) {
        await supabaseAdmin
          .from("contacts")
          .update({ name: contactName })
          .eq("id", contactId);
      }
    } else {
      // Create new contact
      const { data: newContact, error: contactError } = await supabaseAdmin
        .from("contacts")
        .insert({
          workspace_id: profile.workspace_id,
          name: contactName,
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

    // Validate scheduled_at is not in the past
    const scheduledDate = new Date(scheduledAt);
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
      .eq("workspace_id", profile.workspace_id)
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date(scheduledDate.getTime() + (durationMinutes * 60000)).toISOString())
      .gte("scheduled_at", new Date(scheduledDate.getTime() - (durationMinutes * 60000)).toISOString());

    if (conflicts && conflicts.length > 0) {
      return NextResponse.json(
        { error: "Time slot is already booked", conflicts: conflicts.length },
        { status: 409 }
      );
    }

    // Create appointment
    const { data: appointment, error: appointmentError } = await supabaseAdmin
      .from("appointments")
      .insert({
        workspace_id: profile.workspace_id,
        contact_id: contactId,
        scheduled_at: scheduledAt,
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
  { params }: { params: { agentId: string } }
) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date"); // YYYY-MM-DD format
    const duration = parseInt(searchParams.get("duration") || "60");

    // Get workspace
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Verify agent belongs to workspace
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("id, workspace_id")
      .eq("id", params.agentId)
      .eq("workspace_id", profile.workspace_id)
      .single();

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Get existing appointments for the date
    const startDate = date ? new Date(date + "T00:00:00") : new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    const { data: existingAppointments } = await supabaseAdmin
      .from("appointments")
      .select("scheduled_at, duration_minutes")
      .eq("workspace_id", profile.workspace_id)
      .eq("status", "scheduled")
      .gte("scheduled_at", startDate.toISOString())
      .lt("scheduled_at", endDate.toISOString());

    // Generate available slots (9 AM - 5 PM, 30-minute intervals)
    const availableSlots: string[] = [];
    const startHour = 9;
    const endHour = 17;
    const intervalMinutes = 30;

    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += intervalMinutes) {
        const slotTime = new Date(startDate);
        slotTime.setHours(hour, minute, 0, 0);

        // Check if this slot conflicts with existing appointments
        const hasConflict = existingAppointments?.some((apt) => {
          const aptStart = new Date(apt.scheduled_at);
          const aptEnd = new Date(aptStart.getTime() + (apt.duration_minutes || 60) * 60000);
          const slotEnd = new Date(slotTime.getTime() + duration * 60000);

          return (
            (slotTime >= aptStart && slotTime < aptEnd) ||
            (slotEnd > aptStart && slotEnd <= aptEnd) ||
            (slotTime <= aptStart && slotEnd >= aptEnd)
          );
        });

        if (!hasConflict && slotTime > new Date()) {
          availableSlots.push(slotTime.toISOString());
        }
      }
    }

    return NextResponse.json({
      date: date || startDate.toISOString().split("T")[0],
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












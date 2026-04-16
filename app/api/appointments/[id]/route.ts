import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
      contacts (
        id,
        name,
        phone,
        email
      )
    `)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { workspaceId } = await getWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify appointment belongs to workspace
  const { data: appointment } = await supabaseAdmin
    .from("appointments")
    .select("workspace_id, contact_id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, phoneNumber, email, description, scheduledAt, durationMinutes } = body;

  // Normalize phone number if provided
  let normalizedPhone: string | undefined;
  if (phoneNumber) {
    normalizedPhone = normalizePhone(phoneNumber) ?? undefined;
    if (!normalizedPhone) {
      return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 });
    }
  }

  // Update contact if name, phone, or email changed
  if (name || normalizedPhone || email !== undefined) {
    const contactUpdates: Record<string, any> = {};
    if (name) contactUpdates.name = name;
    if (normalizedPhone) contactUpdates.phone = normalizedPhone;
    if (email !== undefined) contactUpdates.email = email || null;

    if (Object.keys(contactUpdates).length > 0) {
      await supabaseAdmin
        .from("contacts")
        .update(contactUpdates)
        .eq("id", appointment.contact_id);
    }
  }

  // Update appointment
  const appointmentUpdates: Record<string, any> = {};
  if (description) appointmentUpdates.service_type = description;
  if (scheduledAt) appointmentUpdates.scheduled_at = scheduledAt;
  if (durationMinutes !== undefined) appointmentUpdates.duration_minutes = durationMinutes;

  if (Object.keys(appointmentUpdates).length === 0) {
    return NextResponse.json({ error: "No update fields provided" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("appointments")
    .update(appointmentUpdates)
    .eq("id", id)
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

  if (error) {
    console.error("Failed to update appointment", error);
    return NextResponse.json({ error: "Failed to update appointment" }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { workspaceId } = await getWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify appointment belongs to workspace
  const { data: appointment } = await supabaseAdmin
    .from("appointments")
    .select("workspace_id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from("appointments")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Failed to delete appointment", error);
    return NextResponse.json({ error: "Failed to delete appointment" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}



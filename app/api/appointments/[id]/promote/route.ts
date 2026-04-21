// app/api/appointments/[id]/promote/route.ts
//
// "Save as client" on an unknown-caller appointment.
//
// An AI-booked call from an unrecognized number lands with contact_id
// NULL and the heard name + normalized phone stashed in caller_name /
// caller_phone. The advisor reviews it, decides it's a real person, and
// clicks Save as client. That fires this endpoint, which:
//
//   1. Either reuses an existing contact with the same phone (in case
//      the advisor added them via the Contacts page in the meantime)
//      or creates a new one.
//   2. Backfills contact_id on THIS appointment AND every sibling
//      unknown-caller appointment from the same phone in this
//      workspace, so subsequent calls from the same number also
//      collapse under the new contact.
//   3. Returns the contact plus the list of appointment ids that were
//      updated, so the client can patch local state without refetching.
//
// Body: { name: string; phone: string }

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }
    const workspaceId = profile.workspace_id;

    const body = await req.json().catch(() => ({}));
    const rawName = typeof body?.name === "string" ? body.name.trim() : "";
    const rawPhone = typeof body?.phone === "string" ? body.phone.trim() : "";
    if (!rawName || !rawPhone) {
      return NextResponse.json(
        { error: "name and phone are required" },
        { status: 400 }
      );
    }
    const normalizedPhone = normalizePhone(rawPhone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "Invalid phone number format" },
        { status: 400 }
      );
    }

    // Make sure the appointment exists in this workspace and is
    // actually an unknown-caller row. We don't want this endpoint to
    // clobber contact_id on appointments that already have a contact.
    const { data: appointment } = await supabaseAdmin
      .from("appointments")
      .select("id, workspace_id, contact_id, caller_phone")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!appointment) {
      return NextResponse.json(
        { error: "Appointment not found" },
        { status: 404 }
      );
    }
    if (appointment.contact_id) {
      return NextResponse.json(
        { error: "Appointment already linked to a contact" },
        { status: 400 }
      );
    }

    // Reuse an existing contact with this phone if one exists — avoids
    // dup rows when the advisor already manually added the client.
    let contact:
      | { id: string; name: string; phone: string; email: string | null }
      | null = null;
    const { data: existing } = await supabaseAdmin
      .from("contacts")
      .select("id, name, phone, email")
      .eq("workspace_id", workspaceId)
      .eq("phone", normalizedPhone)
      .maybeSingle();
    if (existing) {
      contact = existing as any;
    } else {
      const { data: created, error: insertError } = await supabaseAdmin
        .from("contacts")
        .insert({
          workspace_id: workspaceId,
          name: rawName,
          phone: normalizedPhone,
        })
        .select("id, name, phone, email")
        .single();
      if (insertError || !created) {
        return NextResponse.json(
          { error: insertError?.message || "Failed to create contact" },
          { status: 500 }
        );
      }
      contact = created as any;
    }

    // Backfill contact_id on every unknown-caller appointment from this
    // phone in this workspace. Clear caller_name/caller_phone so future
    // reads treat them as normal contact-linked rows.
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("appointments")
      .update({
        contact_id: contact!.id,
        caller_name: null,
        caller_phone: null,
      })
      .eq("workspace_id", workspaceId)
      .eq("caller_phone", normalizedPhone)
      .is("contact_id", null)
      .select("id");

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    const updatedIds = (updated ?? []).map((r: any) => r.id);
    // The current appointment should always be in the list (that's the
    // whole point), but if the phone normalization drifted for some
    // reason make sure we at least patch the row the user clicked.
    if (!updatedIds.includes(id)) {
      await supabaseAdmin
        .from("appointments")
        .update({
          contact_id: contact!.id,
          caller_name: null,
          caller_phone: null,
        })
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      updatedIds.push(id);
    }

    return NextResponse.json({
      contact,
      updatedIds,
    });
  } catch (err: any) {
    console.error("[promote appointment] error", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

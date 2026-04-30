// app/api/contacts/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const contactId = id;

    // Get the current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .single();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const body = await request.json();
    const {
      name,
      email,
      phone,
      notes,
      date_of_birth,
      spouse_date_of_birth,
      state_code,
      is_planning_subject,
    } = body;

    // Validate required fields
    if (!name || !phone) {
      return NextResponse.json({ error: "Name and phone are required" }, { status: 400 });
    }

    // Check if contact exists and belongs to user's workspace
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id, phone")
      .eq("id", contactId)
      .eq("workspace_id", profile.workspace_id)
      .single();

    if (!existingContact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Check for duplicate phone number (excluding current contact)
    if (phone !== existingContact.phone) {
      const { data: duplicateContact } = await supabase
        .from("contacts")
        .select("id")
        .eq("workspace_id", profile.workspace_id)
        .eq("phone", phone)
        .neq("id", contactId)
        .single();

      if (duplicateContact) {
        return NextResponse.json({ error: "A contact with this phone number already exists" }, { status: 400 });
      }
    }

    // Update contact. Planning fields (DOB, state, planning_subject)
    // are optional — only included when the body contains them, so
    // existing PUT callers that don't know about these fields
    // continue to work unchanged.
    const updatePayload: Record<string, unknown> = {
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone.trim(),
      updated_at: new Date().toISOString(),
    };
    if (typeof date_of_birth === "string" || date_of_birth === null) {
      updatePayload.date_of_birth = date_of_birth || null;
    }
    if (typeof spouse_date_of_birth === "string" || spouse_date_of_birth === null) {
      updatePayload.spouse_date_of_birth = spouse_date_of_birth || null;
    }
    if (typeof state_code === "string" || state_code === null) {
      updatePayload.state_code = state_code
        ? state_code.toUpperCase().slice(0, 2)
        : null;
    }
    if (typeof is_planning_subject === "boolean") {
      updatePayload.is_planning_subject = is_planning_subject;
    }
    const { data: contact, error } = await supabase
      .from("contacts")
      .update(updatePayload)
      .eq("id", contactId)
      .eq("workspace_id", profile.workspace_id)
      .select()
      .single();

    if (error) {
      console.error("Contact update error:", error);
      return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });
    }

    return NextResponse.json(contact);
  } catch (error) {
    console.error("Contact update API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const contactId = id;

    // Get the current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .single();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Verify the contact belongs to the user's workspace
    const { data: contact } = await supabase
      .from("contacts")
      .select("workspace_id")
      .eq("id", contactId)
      .single();

    if (!contact || contact.workspace_id !== profile.workspace_id) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Delete the contact
    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("id", contactId);

    if (error) {
      console.error("Delete contact error:", error);
      return NextResponse.json({ error: "Failed to delete contact" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete contact error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

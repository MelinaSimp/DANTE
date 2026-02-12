// app/api/contacts/route.ts
import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { validateContact, sanitizeInput } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
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
    const { name, email, phone, notes } = body;

    // Sanitize inputs
    const sanitizedData = {
      name: sanitizeInput(name || ''),
      email: email ? sanitizeInput(email) : '',
      phone: sanitizeInput(phone || ''),
      notes: notes ? sanitizeInput(notes) : ''
    };

    // Validate data
    const validation = validateContact(sanitizedData);
    if (!validation.isValid) {
      return NextResponse.json({ 
        error: "Validation failed", 
        details: validation.errors 
      }, { status: 400 });
    }

    // Check for duplicate phone number in workspace
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("workspace_id", profile.workspace_id)
      .eq("phone", sanitizedData.phone)
      .single();

    if (existingContact) {
      return NextResponse.json({ error: "A contact with this phone number already exists" }, { status: 400 });
    }

    // Create contact (only insert columns that exist in schema: no notes if DB lacks the column)
    const insertPayload: Record<string, unknown> = {
      workspace_id: profile.workspace_id,
      name: sanitizedData.name,
      email: sanitizedData.email || null,
      phone: sanitizedData.phone,
    };
    const { data: contact, error } = await supabase
      .from("contacts")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error("Contact creation error:", error);
      return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
    }

    return NextResponse.json(contact);
  } catch (error) {
    console.error("Contact API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

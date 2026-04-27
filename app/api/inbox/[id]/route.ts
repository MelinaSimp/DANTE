// app/api/inbox/[id]/route.ts — single email body + thread + linked
// contact + linked property. Body is the full body_text/body_html;
// the inbox list endpoint deliberately omits these to keep the page
// payload small.

import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  const { id } = await params;

  const { data: email } = await supabase
    .from("customer_emails")
    .select(
      "id, contact_id, property_id, direction, from_addr, to_addrs, cc_addrs, subject, body_text, body_html, received_at, category, category_confidence"
    )
    .eq("id", id)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let contact: { id: string; name: string | null; email: string | null } | null = null;
  if (email.contact_id) {
    const { data } = await supabase
      .from("contacts")
      .select("id, name, email")
      .eq("id", email.contact_id)
      .maybeSingle();
    contact = data || null;
  }

  let property: { id: string; address_line1: string; city: string | null } | null = null;
  if (email.property_id) {
    const { data } = await supabase
      .from("properties")
      .select("id, address_line1, city")
      .eq("id", email.property_id)
      .maybeSingle();
    property = data || null;
  }

  return NextResponse.json({ ...email, contact, property });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  const { id } = await params;

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (typeof body.category === "string") updates.category = body.category;
  if (body.property_id === null || typeof body.property_id === "string") {
    updates.property_id = body.property_id || null;
  }
  if (body.contact_id === null || typeof body.contact_id === "string") {
    updates.contact_id = body.contact_id || null;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields" }, { status: 400 });
  }
  // User overrides count as "categorized" — confidence 1.0 since it's
  // a human label, not a model guess.
  if ("category" in updates || "property_id" in updates) {
    updates.categorized_at = new Date().toISOString();
    if ("category" in updates) updates.category_confidence = 1.0;
  }

  const { data, error } = await supabase
    .from("customer_emails")
    .update(updates)
    .eq("id", id)
    .eq("workspace_id", profile.workspace_id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

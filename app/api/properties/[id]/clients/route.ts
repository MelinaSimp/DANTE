// app/api/properties/[id]/clients/route.ts
//
// Attach / detach a contact to a property by role. The role is part of
// the composite primary key, so a single contact can be both buyer and
// seller on the same property if the user really insists (rare but
// possible — a flip / 1031 exchange).

import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const VALID_ROLES = [
  "buyer",
  "seller",
  "tenant",
  "landlord",
  "co_buyer",
  "co_seller",
  "other",
];

async function loadAuth() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) return null;
  return { supabase, workspaceId: profile.workspace_id as string };
}

async function ownsProperty(supabase: any, propertyId: string, workspaceId: string) {
  const { data } = await supabase
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return !!data;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await loadAuth();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: propertyId } = await params;

  if (!(await ownsProperty(ctx.supabase, propertyId, ctx.workspaceId))) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  const { contact_id, role } = await request.json();
  if (!contact_id || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "contact_id + valid role required" }, { status: 400 });
  }

  // Confirm the contact also belongs to this workspace.
  const { data: contact } = await ctx.supabase
    .from("contacts")
    .select("id")
    .eq("id", contact_id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!contact) {
    return NextResponse.json({ error: "Contact not in this workspace" }, { status: 404 });
  }

  const { error } = await ctx.supabase
    .from("property_clients")
    .insert({ property_id: propertyId, contact_id, role });

  if (error) {
    // Composite-PK collision — already linked at this role. Treat as ok.
    if (error.code === "23505") return NextResponse.json({ success: true });
    console.error("property_clients insert:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await loadAuth();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: propertyId } = await params;

  if (!(await ownsProperty(ctx.supabase, propertyId, ctx.workspaceId))) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const contact_id = searchParams.get("contact_id");
  const role = searchParams.get("role");
  if (!contact_id || !role) {
    return NextResponse.json({ error: "contact_id + role required" }, { status: 400 });
  }

  const { error } = await ctx.supabase
    .from("property_clients")
    .delete()
    .eq("property_id", propertyId)
    .eq("contact_id", contact_id)
    .eq("role", role);

  if (error) {
    console.error("property_clients delete:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

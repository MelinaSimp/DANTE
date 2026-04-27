// app/api/properties/[id]/route.ts
//
// Single-property fetch / update / delete. Workspace isolation comes
// from RLS in the database; we just scope the query so an authed user
// from another workspace gets a 404 instead of someone else's data.

import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const VALID_STATUSES = ["active", "pending", "sold", "withdrawn", "off_market"];
const VALID_KINDS = ["residential", "commercial", "rental", "land", "other"];

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
  return { supabase, user, workspaceId: profile.workspace_id as string };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await loadAuth();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: property, error } = await ctx.supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (error || !property) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Linked clients (via property_clients).
  const { data: links } = await ctx.supabase
    .from("property_clients")
    .select("contact_id, role")
    .eq("property_id", id);

  let clients: Array<{ contact_id: string; role: string; name: string | null; email: string | null; phone: string | null }> = [];
  if (links && links.length > 0) {
    const ids = links.map((l: any) => l.contact_id);
    const { data: contacts } = await ctx.supabase
      .from("contacts")
      .select("id, name, email, phone")
      .in("id", ids);
    const byId = new Map((contacts || []).map((c: any) => [c.id, c]));
    clients = links.map((l: any) => ({
      contact_id: l.contact_id,
      role: l.role,
      name: byId.get(l.contact_id)?.name ?? null,
      email: byId.get(l.contact_id)?.email ?? null,
      phone: byId.get(l.contact_id)?.phone ?? null,
    }));
  }

  return NextResponse.json({ ...property, clients });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await loadAuth();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (typeof body.address_line1 === "string") updates.address_line1 = body.address_line1.trim();
  if (typeof body.address_line2 === "string") updates.address_line2 = body.address_line2.trim() || null;
  if (typeof body.city === "string") updates.city = body.city.trim() || null;
  if (typeof body.state === "string") updates.state = body.state.trim() || null;
  if (typeof body.zip === "string") updates.zip = body.zip.trim() || null;
  if (typeof body.beds === "number" || body.beds === null) updates.beds = body.beds;
  if (typeof body.baths === "number" || body.baths === null) updates.baths = body.baths;
  if (typeof body.sqft === "number" || body.sqft === null) updates.sqft = body.sqft;
  if (body.kind === null || (typeof body.kind === "string" && VALID_KINDS.includes(body.kind))) {
    updates.kind = body.kind;
  }
  if (typeof body.list_price_cents === "number" || body.list_price_cents === null) {
    updates.list_price_cents = body.list_price_cents;
  }
  if (typeof body.status === "string" && VALID_STATUSES.includes(body.status)) {
    updates.status = body.status;
    // Stamp lifecycle timestamps on transitions.
    if (body.status === "sold") updates.sold_at = new Date().toISOString();
    if (body.status === "active" && !body.listed_at_supplied) {
      // listed_at is set on first move into "active" — keep client-supplied if any.
    }
  }
  if (typeof body.listed_at === "string" || body.listed_at === null) updates.listed_at = body.listed_at;
  if (typeof body.sold_at === "string" || body.sold_at === null) updates.sold_at = body.sold_at;
  if (typeof body.notes === "string") updates.notes = body.notes;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { data, error } = await ctx.supabase
    .from("properties")
    .update(updates)
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .select()
    .single();

  if (error) {
    console.error("Properties PATCH:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await loadAuth();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { error } = await ctx.supabase
    .from("properties")
    .delete()
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);

  if (error) {
    console.error("Properties DELETE:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

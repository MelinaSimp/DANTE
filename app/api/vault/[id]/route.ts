// app/api/vault/[id]/route.ts
//
// Single vault item — fetch (with linked clients + property),
// update metadata, delete. The file content itself isn't editable
// here; users delete + re-upload to replace.

import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { canAccessProject, getAccessibleProjectIds } from "@/lib/vault/project-access";

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

  const { data: item, error } = await ctx.supabase
    .from("vault_items")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (error || !item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (item.project_id && !(await canAccessProject(ctx.supabase, ctx.user.id, ctx.workspaceId, item.project_id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: links } = await ctx.supabase
    .from("vault_item_clients")
    .select("contact_id")
    .eq("vault_item_id", id);

  let clients: Array<{ contact_id: string; name: string | null; email: string | null; phone: string | null }> = [];
  if (links && links.length > 0) {
    const ids = links.map((l: any) => l.contact_id);
    const { data: contacts } = await ctx.supabase
      .from("contacts")
      .select("id, name, email, phone")
      .in("id", ids);
    clients = (contacts || []).map((c: any) => ({
      contact_id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
    }));
  }

  let property: { id: string; address_line1: string; city: string | null } | null = null;
  if (item.property_id) {
    const { data: p } = await ctx.supabase
      .from("properties")
      .select("id, address_line1, city")
      .eq("id", item.property_id)
      .maybeSingle();
    property = p || null;
  }

  return NextResponse.json({ ...item, clients, property });
}

const VALID_KINDS = ["template", "document"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await loadAuth();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: existing } = await ctx.supabase
    .from("vault_items")
    .select("project_id")
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.project_id && !(await canAccessProject(ctx.supabase, ctx.user.id, ctx.workspaceId, existing.project_id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  const changingProject =
    ("project_id" in body) && body.project_id !== existing.project_id;
  if (changingProject) {
    const { isAdmin } = await getAccessibleProjectIds(ctx.supabase, ctx.user.id, ctx.workspaceId);
    if (!isAdmin) {
      return NextResponse.json({ error: "Only admins can reassign project" }, { status: 403 });
    }
    if (body.project_id && !(await canAccessProject(ctx.supabase, ctx.user.id, ctx.workspaceId, body.project_id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.title === "string") updates.title = body.title.trim();
  if (typeof body.description === "string") updates.description = body.description.trim() || null;
  if (typeof body.kind === "string" && VALID_KINDS.includes(body.kind)) updates.kind = body.kind;
  if (body.property_id === null || typeof body.property_id === "string") {
    updates.property_id = body.property_id || null;
  }
  if (body.project_id === null || typeof body.project_id === "string") {
    updates.project_id = body.project_id || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields" }, { status: 400 });
  }

  const { data, error } = await ctx.supabase
    .from("vault_items")
    .update(updates)
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .select()
    .single();
  if (error) {
    console.error("Vault PATCH:", error);
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

  const { data: delItem } = await ctx.supabase
    .from("vault_items")
    .select("project_id")
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (delItem?.project_id && !(await canAccessProject(ctx.supabase, ctx.user.id, ctx.workspaceId, delItem.project_id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await ctx.supabase
    .from("vault_items")
    .delete()
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

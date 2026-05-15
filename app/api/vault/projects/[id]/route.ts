// app/api/vault/projects/[id]/route.ts — get / update / delete a
// vault project. GET returns the project + every item belonging to
// it so the detail page renders in one round-trip.

import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { canAccessProject } from "@/lib/vault/project-access";

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
  return { supabase, userId: user.id, workspaceId: profile.workspace_id as string };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await loadAuth();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  if (!(await canAccessProject(ctx.supabase, ctx.userId, ctx.workspaceId, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: project } = await ctx.supabase
    .from("vault_projects")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: items } = await ctx.supabase
    .from("vault_items")
    .select(
      "id, kind, title, description, file_url, file_size, file_type, created_at, updated_at"
    )
    .eq("project_id", id)
    .eq("workspace_id", ctx.workspaceId)
    .order("updated_at", { ascending: false });

  return NextResponse.json({ ...project, items: items || [] });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await loadAuth();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  if (!(await canAccessProject(ctx.supabase, ctx.userId, ctx.workspaceId, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (typeof body.description === "string") updates.description = body.description.trim() || null;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields" }, { status: 400 });
  }
  const { data, error } = await ctx.supabase
    .from("vault_projects")
    .update(updates)
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await loadAuth();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  if (!(await canAccessProject(ctx.supabase, ctx.userId, ctx.workspaceId, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Items in this project: ON DELETE SET NULL via the FK, so they
  // stay in the vault but become "loose" — not destroyed.
  const { error } = await ctx.supabase
    .from("vault_projects")
    .delete()
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

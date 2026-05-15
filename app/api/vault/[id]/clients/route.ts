// app/api/vault/[id]/clients/route.ts — link / unlink contacts.

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

async function ownsItem(supabase: any, userId: string, itemId: string, workspaceId: string) {
  const { data } = await supabase
    .from("vault_items")
    .select("id, project_id")
    .eq("id", itemId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data) return false;
  if (data.project_id && !(await canAccessProject(supabase, userId, workspaceId, data.project_id))) {
    return false;
  }
  return true;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await loadAuth();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: itemId } = await params;
  if (!(await ownsItem(ctx.supabase, ctx.userId, itemId, ctx.workspaceId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { contact_id } = await request.json();
  if (!contact_id) {
    return NextResponse.json({ error: "contact_id required" }, { status: 400 });
  }

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
    .from("vault_item_clients")
    .insert({ vault_item_id: itemId, contact_id });
  if (error && error.code !== "23505") {
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
  const { id: itemId } = await params;
  if (!(await ownsItem(ctx.supabase, ctx.userId, itemId, ctx.workspaceId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const contact_id = searchParams.get("contact_id");
  if (!contact_id) {
    return NextResponse.json({ error: "contact_id required" }, { status: 400 });
  }

  const { error } = await ctx.supabase
    .from("vault_item_clients")
    .delete()
    .eq("vault_item_id", itemId)
    .eq("contact_id", contact_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

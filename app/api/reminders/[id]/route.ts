// app/api/reminders/[id]/route.ts — get / update / delete

import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await loadAuth();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data, error } = await ctx.supabase
    .from("reminders")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
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
  for (const k of [
    "to_email",
    "subject",
    "body",
    "send_at",
    "reason",
    "contact_id",
    "property_id",
  ]) {
    if (k in body) updates[k] = body[k];
  }

  const { data, error } = await ctx.supabase
    .from("reminders")
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
  const { error } = await ctx.supabase
    .from("reminders")
    .delete()
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

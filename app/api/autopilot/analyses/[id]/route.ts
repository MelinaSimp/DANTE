// app/api/autopilot/analyses/[id]/route.ts
//
// POST   { status: "approved" | "dismissed" | "pending" }  -> update review state
// DELETE                                                    -> remove an analysis

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function workspaceFor(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.workspace_id ?? null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const workspaceId = await workspaceFor();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const status = body.status;
  if (!["approved", "dismissed", "pending"].includes(status)) {
    return NextResponse.json({ error: "status must be approved, dismissed, or pending" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("dante_document_analyses")
    .update({ status })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ analysis: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const workspaceId = await workspaceFor();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabaseAdmin
    .from("dante_document_analyses")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

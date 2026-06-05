// GET  /api/dante/workflows/dead-letters — list failed runs for workspace
// PATCH /api/dante/workflows/dead-letters — mark dead letter as retried/discarded

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id)
    return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("dante_workflow_dead_letters")
    .select("id, run_id, workflow_id, node_id, node_type, error_message, status, created_at")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ dead_letters: data ?? [] });
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id)
    return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = await request.json();
  const { id, action } = body as { id?: string; action?: string };

  if (!id || !["retried", "discarded"].includes(action || "")) {
    return NextResponse.json(
      { error: "Provide id and action (retried | discarded)" },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin
    .from("dante_workflow_dead_letters")
    .update({ status: action, resolved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", profile.workspace_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

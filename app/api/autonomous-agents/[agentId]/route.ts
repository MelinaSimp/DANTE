// Delete a customer-created autonomous agent.
// Only is_custom=true agents can be deleted — the RLS delete policy enforces
// this too, but we check here so the error message is friendlier.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  const wid = profile?.workspace_id;
  if (!wid) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const { data: agent } = await supabaseAdmin
    .from("wm_agent_definitions")
    .select("id, is_custom, workspace_id")
    .eq("id", agentId)
    .eq("workspace_id", wid)
    .maybeSingle();

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  if (!agent.is_custom) {
    return NextResponse.json(
      { error: "Preset agents can't be deleted" },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("wm_agent_definitions")
    .delete()
    .eq("id", agentId)
    .eq("workspace_id", wid);

  if (error) {
    return NextResponse.json(
      { error: error.message || "Delete failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

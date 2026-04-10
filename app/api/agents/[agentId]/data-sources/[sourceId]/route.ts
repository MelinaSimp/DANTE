import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

async function getWorkspace(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { workspaceId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  return { workspaceId: profile?.workspace_id ?? null };
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string; sourceId: string }> }
) {
  const { agentId, sourceId } = await params;
  const { workspaceId } = await getWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify agent belongs to workspace
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("workspace_id")
    .eq("id", agentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from("agent_data_sources")
    .delete()
    .eq("id", sourceId)
    .eq("agent_id", agentId);

  if (error) {
    console.error("Failed to delete data source", error);
    return NextResponse.json({ error: "Failed to delete data source" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}













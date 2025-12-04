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

export async function PUT(
  req: NextRequest,
  { params }: { params: { scenarioId: string } }
) {
  const { workspaceId } = await getWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify scenario belongs to workspace via agent
  const { data: scenario } = await supabaseAdmin
    .from("scenarios")
    .select("agent_id, agents!inner(workspace_id)")
    .eq("id", params.scenarioId)
    .maybeSingle();

  if (!scenario || (scenario.agents as any).workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
  }

  const body = await req.json();
  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;

  const { data, error } = await supabaseAdmin
    .from("scenarios")
    .update(updates)
    .eq("id", params.scenarioId)
    .select("*")
    .single();

  if (error) {
    console.error("Failed to update scenario", error);
    return NextResponse.json({ error: "Failed to update scenario" }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { scenarioId: string } }
) {
  const { workspaceId } = await getWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify scenario belongs to workspace via agent
  const { data: scenario } = await supabaseAdmin
    .from("scenarios")
    .select("agent_id, agents!inner(workspace_id)")
    .eq("id", params.scenarioId)
    .maybeSingle();

  if (!scenario || (scenario.agents as any).workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from("scenarios")
    .delete()
    .eq("id", params.scenarioId);

  if (error) {
    console.error("Failed to delete scenario", error);
    return NextResponse.json({ error: "Failed to delete scenario" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}












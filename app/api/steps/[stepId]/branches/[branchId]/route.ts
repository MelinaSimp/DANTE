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
  { params }: { params: { stepId: string; branchId: string } }
) {
  const { workspaceId } = await getWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify step belongs to workspace
  const { data: step } = await supabaseAdmin
    .from("steps")
    .select("scenario_id, scenarios!inner(agent_id, agents!inner(workspace_id))")
    .eq("id", params.stepId)
    .maybeSingle();

  if (!step || ((step.scenarios as any).agents as any).workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Step not found" }, { status: 404 });
  }

  const body = await req.json();
  const updates: Record<string, any> = {};

  if (body.condition !== undefined) updates.condition = body.condition;
  if (body.condition_tag !== undefined) updates.condition_tag = body.condition_tag;
  if (body.next_step_id !== undefined) updates.next_step_id = body.next_step_id;
  if (body.next_scenario_id !== undefined) updates.next_scenario_id = body.next_scenario_id;
  if (body.action !== undefined) updates.action = body.action;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;

  const { data, error } = await supabaseAdmin
    .from("step_branches")
    .update(updates)
    .eq("id", params.branchId)
    .eq("step_id", params.stepId)
    .select("*")
    .single();

  if (error) {
    console.error("Failed to update branch", error);
    return NextResponse.json({ error: "Failed to update branch" }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { stepId: string; branchId: string } }
) {
  const { workspaceId } = await getWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify step belongs to workspace
  const { data: step } = await supabaseAdmin
    .from("steps")
    .select("scenario_id, scenarios!inner(agent_id, agents!inner(workspace_id))")
    .eq("id", params.stepId)
    .maybeSingle();

  if (!step || ((step.scenarios as any).agents as any).workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Step not found" }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from("step_branches")
    .delete()
    .eq("id", params.branchId)
    .eq("step_id", params.stepId);

  if (error) {
    console.error("Failed to delete branch", error);
    return NextResponse.json({ error: "Failed to delete branch" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

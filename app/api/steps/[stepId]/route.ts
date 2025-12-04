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

export async function GET(
  req: NextRequest,
  { params }: { params: { stepId: string } }
) {
  const { workspaceId } = await getWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify step belongs to workspace via scenario -> agent
  const { data: step } = await supabaseAdmin
    .from("steps")
    .select("scenario_id, scenarios!inner(agent_id, agents!inner(workspace_id))")
    .eq("id", params.stepId)
    .maybeSingle();

  if (!step || ((step.scenarios as any).agents as any).workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Step not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("steps")
    .select("*")
    .eq("id", params.stepId)
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to fetch step" }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { stepId: string } }
) {
  const { workspaceId } = await getWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify step belongs to workspace via scenario -> agent
  const { data: step } = await supabaseAdmin
    .from("steps")
    .select("scenario_id, scenarios!inner(agent_id, agents!inner(workspace_id))")
    .eq("id", params.stepId)
    .maybeSingle();

  if (!step || ((step.scenarios as any).agents as any).workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Step not found" }, { status: 404 });
  }

  const body = await req.json();
  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (body.name !== undefined) updates.name = body.name;
  if (body.type !== undefined) updates.type = body.type;
  if (body.code !== undefined) updates.code = body.code;
  if (body.ai_message !== undefined) updates.ai_message = body.ai_message;
  if (body.input_schema !== undefined) updates.input_schema = body.input_schema;
  if (body.callable_functions !== undefined) updates.callable_functions = body.callable_functions;
  if (body.apis !== undefined) updates.apis = body.apis;
  if (body.global_variables !== undefined) updates.global_variables = body.global_variables;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;
  // New step configuration fields
  if (body.transfer_config !== undefined) updates.transfer_config = body.transfer_config;
  if (body.loop_config !== undefined) updates.loop_config = body.loop_config;
  if (body.sms_config !== undefined) updates.sms_config = body.sms_config;
  if (body.selected_data_source_ids !== undefined) updates.selected_data_source_ids = body.selected_data_source_ids;

  const { data, error } = await supabaseAdmin
    .from("steps")
    .update(updates)
    .eq("id", params.stepId)
    .select("*")
    .single();

  if (error) {
    console.error("Failed to update step", error);
    return NextResponse.json({ error: "Failed to update step" }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { stepId: string } }
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

  // Delete branches first (if any)
  const { error: branchesError } = await supabaseAdmin
    .from("branches")
    .delete()
    .eq("step_id", params.stepId);

  if (branchesError) {
    console.error("Failed to delete branches", branchesError);
    // Continue anyway - branches might not exist
  }

  // Delete the step
  const { error } = await supabaseAdmin
    .from("steps")
    .delete()
    .eq("id", params.stepId);

  if (error) {
    console.error("Failed to delete step", error);
    console.error("Error details:", JSON.stringify(error, null, 2));
    return NextResponse.json({ 
      error: `Failed to delete step: ${error.message || error.details || "Unknown error"}` 
    }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

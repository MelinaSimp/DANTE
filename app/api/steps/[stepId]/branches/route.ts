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
  { params }: { params: Promise<{ stepId: string }> }
) {
  const { stepId } = await params;
  const { workspaceId } = await getWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify step belongs to workspace via scenario -> agent
  const { data: step } = await supabaseAdmin
    .from("steps")
    .select("scenario_id, scenarios!inner(agent_id, agents!inner(workspace_id))")
    .eq("id", stepId)
    .maybeSingle();

  if (!step || ((step.scenarios as any).agents as any).workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Step not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("step_branches")
    .select("*")
    .eq("step_id", stepId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to fetch branches", error);
    return NextResponse.json({ error: "Failed to fetch branches" }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ stepId: string }> }
) {
  const { stepId } = await params;
  const { workspaceId } = await getWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify step belongs to workspace
  const { data: step } = await supabaseAdmin
    .from("steps")
    .select("scenario_id, scenarios!inner(agent_id, agents!inner(workspace_id))")
    .eq("id", stepId)
    .maybeSingle();

  if (!step || ((step.scenarios as any).agents as any).workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Step not found" }, { status: 404 });
  }

  const body = await req.json();
  const { condition, condition_tag, next_step_id, next_scenario_id, action } = body;

  if (!condition) {
    return NextResponse.json({ error: "Condition is required" }, { status: 400 });
  }

  // Get max sort_order
  const { data: maxOrder } = await supabaseAdmin
    .from("step_branches")
    .select("sort_order")
    .eq("step_id", stepId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabaseAdmin
    .from("step_branches")
    .insert({
      step_id: stepId,
      condition,
      condition_tag: condition_tag || null,
      next_step_id: next_step_id || null,
      next_scenario_id: next_scenario_id || null,
      action: action || null,
      sort_order: (maxOrder?.sort_order || 0) + 1,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Failed to create branch", error);
    return NextResponse.json({ error: "Failed to create branch" }, { status: 500 });
  }

  return NextResponse.json(data);
}












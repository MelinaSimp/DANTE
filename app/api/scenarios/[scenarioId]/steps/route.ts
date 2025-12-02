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

  const { data, error } = await supabaseAdmin
    .from("steps")
    .select("*")
    .eq("scenario_id", params.scenarioId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to fetch steps", error);
    return NextResponse.json({ error: "Failed to fetch steps" }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(
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
  const { name, type, code, ai_message } = body;

  if (!name || !type) {
    return NextResponse.json({ error: "Name and type are required" }, { status: 400 });
  }

  // Get max sort_order
  const { data: maxOrder } = await supabaseAdmin
    .from("steps")
    .select("sort_order")
    .eq("scenario_id", params.scenarioId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Build insert payload - only include fields that exist in the schema
  const insertPayload: any = {
    scenario_id: params.scenarioId,
    name,
    type,
    sort_order: (maxOrder?.sort_order || 0) + 1,
  };

  // Add optional fields only if they're provided
  if (code !== undefined) insertPayload.code = code;
  if (ai_message !== undefined) insertPayload.ai_message = ai_message;

  const { data, error } = await supabaseAdmin
    .from("steps")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    console.error("Failed to create step", error);
    console.error("Error details:", JSON.stringify(error, null, 2));
    console.error("Insert payload:", JSON.stringify(insertPayload, null, 2));
    return NextResponse.json({ error: `Failed to create step: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json(data);
}













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
  { params }: { params: { agentId: string } }
) {
  const { workspaceId } = await getWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify agent belongs to workspace
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("workspace_id")
    .eq("id", params.agentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("scenarios")
    .select("*")
    .eq("agent_id", params.agentId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to fetch scenarios", error);
    return NextResponse.json({ error: "Failed to fetch scenarios" }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const { workspaceId } = await getWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify agent belongs to workspace
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("workspace_id")
    .eq("id", params.agentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, description } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Get max sort_order
  const { data: maxOrder } = await supabaseAdmin
    .from("scenarios")
    .select("sort_order")
    .eq("agent_id", params.agentId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabaseAdmin
    .from("scenarios")
    .insert({
      agent_id: params.agentId,
      name,
      description: description || null,
      sort_order: (maxOrder?.sort_order || 0) + 1,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Failed to create scenario", error);
    return NextResponse.json({ error: "Failed to create scenario" }, { status: 500 });
  }

  return NextResponse.json(data);
}













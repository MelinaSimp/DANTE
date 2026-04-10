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
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
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

  const { data, error } = await supabaseAdmin
    .from("supporting_docs")
    .select("*")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch supporting docs", error);
    return NextResponse.json({ error: "Failed to fetch supporting docs" }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
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

  const body = await req.json();
  const { name, type, content, file_url, file_size, file_type } = body;

  if (!name || !type) {
    return NextResponse.json({ error: "Name and type are required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("supporting_docs")
    .insert({
      agent_id: agentId,
      name,
      type,
      content: type === "text" ? content : null,
      file_url: type === "file" ? file_url : null,
      file_size: type === "file" ? file_size : null,
      file_type: type === "file" ? file_type : null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Failed to create supporting doc", error);
    return NextResponse.json({ error: "Failed to create supporting doc" }, { status: 500 });
  }

  return NextResponse.json(data);
}













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
    .from("agent_personalization")
    .select("*")
    .eq("agent_id", params.agentId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("Failed to fetch personalization", error);
    return NextResponse.json({ error: "Failed to fetch personalization" }, { status: 500 });
  }

  // Return defaults if not found
  if (!data) {
    return NextResponse.json({
      agent_id: params.agentId,
      voice_model: "professional",
      personality: "helpful",
      response_style: "concise",
      humor_level: "none",
      formality: "neutral",
      response_length: "medium",
      language: "english",
      emoji_usage: "none",
    });
  }

  return NextResponse.json(data);
}

export async function PUT(
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
  const updates: Record<string, any> = {
    agent_id: params.agentId,
    updated_at: new Date().toISOString(),
  };

  if (body.voice_model !== undefined) updates.voice_model = body.voice_model;
  if (body.personality !== undefined) updates.personality = body.personality;
  if (body.response_style !== undefined) updates.response_style = body.response_style;
  if (body.humor_level !== undefined) updates.humor_level = body.humor_level;
  if (body.formality !== undefined) updates.formality = body.formality;
  if (body.response_length !== undefined) updates.response_length = body.response_length;
  if (body.language !== undefined) updates.language = body.language;
  if (body.emoji_usage !== undefined) updates.emoji_usage = body.emoji_usage;

  const { data, error } = await supabaseAdmin
    .from("agent_personalization")
    .upsert(updates, { onConflict: "agent_id" })
    .select("*")
    .single();

  if (error) {
    console.error("Failed to update personalization", error);
    return NextResponse.json({ error: "Failed to update personalization" }, { status: 500 });
  }

  return NextResponse.json(data);
}











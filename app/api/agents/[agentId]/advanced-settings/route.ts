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
    .from("agent_advanced_settings")
    .select("*")
    .eq("agent_id", params.agentId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("Failed to fetch advanced settings", error);
    return NextResponse.json({ error: "Failed to fetch advanced settings" }, { status: 500 });
  }

  // Return defaults if not found
  if (!data) {
    return NextResponse.json({
      agent_id: params.agentId,
      api_key: null,
      webhooks: [],
      database_connections: [],
      custom_code: null,
      debug_mode: false,
      rate_limiting: 100,
      timeout_seconds: 30,
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

  if (body.api_key !== undefined) updates.api_key = body.api_key;
  if (body.webhooks !== undefined) updates.webhooks = body.webhooks;
  if (body.database_connections !== undefined) updates.database_connections = body.database_connections;
  if (body.custom_code !== undefined) updates.custom_code = body.custom_code;
  if (body.debug_mode !== undefined) updates.debug_mode = body.debug_mode;
  if (body.rate_limiting !== undefined) updates.rate_limiting = body.rate_limiting;
  if (body.timeout_seconds !== undefined) updates.timeout_seconds = body.timeout_seconds;

  const { data, error } = await supabaseAdmin
    .from("agent_advanced_settings")
    .upsert(updates, { onConflict: "agent_id" })
    .select("*")
    .single();

  if (error) {
    console.error("Failed to update advanced settings", error);
    return NextResponse.json({ error: "Failed to update advanced settings" }, { status: 500 });
  }

  return NextResponse.json(data);
}











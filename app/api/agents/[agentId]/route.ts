import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";

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

  const { data, error } = await supabaseAdmin
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PUT(
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
  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (body.name !== undefined) updates.name = body.name;
  if (body.modality !== undefined) updates.modality = body.modality;
  if (body.description !== undefined) updates.description = body.description;
  if (body.phone_number !== undefined) {
    // Normalize phone number to E.164 format before saving
    const normalized = normalizePhone(body.phone_number);
    updates.phone_number = normalized || body.phone_number; // Fallback to original if normalization fails
  }
  if (body.status !== undefined) updates.status = body.status;
  if (body.elevenlabs_voice_id !== undefined) updates.elevenlabs_voice_id = body.elevenlabs_voice_id;
  // New fields for agent role and specialist routing
  if (body.agent_role !== undefined) updates.agent_role = body.agent_role;
  if (body.is_specialist !== undefined) updates.is_specialist = body.is_specialist;
  if (body.parent_agent_id !== undefined) updates.parent_agent_id = body.parent_agent_id;
  if (body.routing_keywords !== undefined) updates.routing_keywords = body.routing_keywords;

  const { data, error } = await supabaseAdmin
    .from("agents")
    .update(updates)
    .eq("id", agentId)
    .select("*")
    .single();

  if (error) {
    console.error("Failed to update agent", error);
    return NextResponse.json({ error: "Failed to update agent" }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
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

  const { error } = await supabaseAdmin
    .from("agents")
    .delete()
    .eq("id", agentId);

  if (error) {
    console.error("Failed to delete agent", error);
    return NextResponse.json({ error: "Failed to delete agent" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}


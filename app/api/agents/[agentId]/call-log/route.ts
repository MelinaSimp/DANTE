import { NextRequest, NextResponse } from "next/server";
import { requireUserWithWorkspace } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Verify agent belongs to the caller's workspace */
async function verifyAgentOwnership(agentId: string, workspaceId: string) {
  const { data } = await supabaseAdmin
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return !!data;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { error, workspaceId } = await requireUserWithWorkspace();
  if (error) return error;
  if (!workspaceId) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const { agentId } = await params;

  if (!(await verifyAgentOwnership(agentId, workspaceId))) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const { data, error: dbErr } = await supabaseAdmin
    .from("outbound_call_logs")
    .select("*")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { error, workspaceId } = await requireUserWithWorkspace();
  if (error) return error;
  if (!workspaceId) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const { agentId } = await params;

  if (!(await verifyAgentOwnership(agentId, workspaceId))) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const body = await req.json();

  const { data, error: dbErr } = await supabaseAdmin
    .from("outbound_call_logs")
    .insert({
      agent_id: agentId,
      phone_number: body.phone_number,
      status: body.status || "in-progress",
      duration: body.duration || 0,
      summary: body.summary || "",
      recording_url: body.recording_url || null,
      transcript: body.transcript || null,
      vapi_call_id: body.vapi_call_id || null,
    })
    .select()
    .single();

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { error, workspaceId } = await requireUserWithWorkspace();
  if (error) return error;
  if (!workspaceId) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const { agentId } = await params;

  if (!(await verifyAgentOwnership(agentId, workspaceId))) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data, error: dbErr } = await supabaseAdmin
    .from("outbound_call_logs")
    .update(updates)
    .eq("id", id)
    .eq("agent_id", agentId)
    .select()
    .single();

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { error, workspaceId } = await requireUserWithWorkspace();
  if (error) return error;
  if (!workspaceId) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const { agentId } = await params;

  if (!(await verifyAgentOwnership(agentId, workspaceId))) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  if (action === "clear-all") {
    await supabaseAdmin.from("outbound_call_logs").delete().eq("agent_id", agentId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

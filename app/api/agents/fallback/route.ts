// POST /api/agents/fallback
//
// Sets (or clears) the human fallback number for an agent. This is the
// number the live caller gets bridged to when they ask for a human —
// see /api/twilio/response for the runtime behaviour.
//
// Body: { agent_id: string, phone_number: string | null }
//
// Admin-only and workspace-scoped: callers can't edit agents that
// don't belong to their workspace.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isWorkspaceAdmin } from "@/lib/rbac";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  if (!isWorkspaceAdmin(profile.role)) {
    return NextResponse.json(
      { error: "Only workspace admins can configure call transfers." },
      { status: 403 },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const agentId = typeof body?.agent_id === "string" ? body.agent_id : null;
  if (!agentId) {
    return NextResponse.json({ error: "agent_id is required" }, { status: 400 });
  }

  const rawPhone =
    body?.phone_number === null || body?.phone_number === undefined
      ? null
      : String(body.phone_number).trim();

  // Verify the agent lives in this workspace before we mutate it.
  const { data: agent } = await supabase
    .from("agents")
    .select("id, workspace_id")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent || agent.workspace_id !== profile.workspace_id) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Clear path
  if (!rawPhone) {
    const { error } = await supabaseAdmin
      .from("agents")
      .update({ human_fallback_number: null })
      .eq("id", agentId);
    if (error) {
      console.error("[agents/fallback] clear failed:", error);
      return NextResponse.json({ error: "Failed to clear." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, human_fallback_number: null });
  }

  const normalized = normalizePhone(rawPhone);
  if (!normalized) {
    return NextResponse.json(
      {
        error:
          "That phone number doesn't look right. Use a full number including country code.",
      },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin
    .from("agents")
    .update({ human_fallback_number: normalized })
    .eq("id", agentId);
  if (error) {
    console.error("[agents/fallback] update failed:", error);
    return NextResponse.json({ error: "Failed to save." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, human_fallback_number: normalized });
}

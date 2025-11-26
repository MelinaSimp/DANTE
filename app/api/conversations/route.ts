/**
 * Conversations API
 * Create and manage conversation sessions
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { agentId, modality, channelId, fromNumber, toNumber } = body;

    if (!agentId || !modality) {
      return NextResponse.json({ error: "agentId and modality required" }, { status: 400 });
    }

    // Get workspace
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Verify agent belongs to workspace
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("id, workspace_id, status")
      .eq("id", agentId)
      .eq("workspace_id", profile.workspace_id)
      .single();

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (agent.status !== "deployed") {
      return NextResponse.json({ error: "Agent is not deployed" }, { status: 400 });
    }

    // Get first scenario for this agent
    const { data: scenarios } = await supabaseAdmin
      .from("scenarios")
      .select("id")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: true })
      .limit(1);

    const scenarioId = scenarios && scenarios.length > 0 ? scenarios[0].id : null;

    // Get first step of scenario
    let currentStepId = null;
    if (scenarioId) {
      const { data: steps } = await supabaseAdmin
        .from("steps")
        .select("id")
        .eq("scenario_id", scenarioId)
        .order("sort_order", { ascending: true })
        .limit(1);

      currentStepId = steps && steps.length > 0 ? steps[0].id : null;
    }

    // Create conversation
    const { data: conversation, error } = await supabaseAdmin
      .from("conversations")
      .insert({
        agent_id: agentId,
        workspace_id: profile.workspace_id,
        modality,
        channel_id: channelId,
        from_number: fromNumber,
        to_number: toNumber,
        current_scenario_id: scenarioId,
        current_step_id: currentStepId,
        status: "active",
        gathered_data: {},
        conversation_state: {},
        transcript: [],
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create conversation:", error);
      return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
    }

    return NextResponse.json(conversation);
  } catch (error: any) {
    console.error("Conversation creation error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");
    const channelId = searchParams.get("channelId");

    let query = supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("workspace_id", profile.workspace_id);

    if (agentId) {
      query = query.eq("agent_id", agentId);
    }

    if (channelId) {
      query = query.eq("channel_id", channelId);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch conversations:", error);
      return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("Conversation fetch error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}











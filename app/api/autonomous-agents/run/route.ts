import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { executeAutonomousAgent } from "@/lib/autonomous-agents/engine";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    const wid = profile?.workspace_id;
    if (!wid) return NextResponse.json({ error: "No workspace" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const { agentId } = body as { agentId?: string };

    if (agentId) {
      const result = await executeAutonomousAgent(agentId, wid);
      return NextResponse.json({ agentsRun: 1, results: [result] });
    }

    const { data: agents } = await supabaseAdmin
      .from("wm_agent_definitions")
      .select("id")
      .eq("workspace_id", wid);

    if (!agents?.length) {
      return NextResponse.json({ agentsRun: 0, results: [] });
    }

    const results = [];
    for (const agent of agents) {
      const result = await executeAutonomousAgent(agent.id, wid);
      results.push({ agentId: agent.id, ...result });
    }

    return NextResponse.json({ agentsRun: agents.length, results });
  } catch (error) {
    console.error("Run autonomous agents error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

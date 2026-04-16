import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { executeAutonomousAgent } from "@/lib/autonomous-agents/engine";
import { seedAutonomousAgents } from "@/lib/autonomous-agents/seed";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 }
    );
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: workspaces } = await supabaseAdmin
    .from("workspaces")
    .select("id");

  if (!workspaces?.length) {
    return NextResponse.json({ message: "No workspaces", results: [] });
  }

  const allResults: { workspaceId: string; agentsRun: number; errors: number }[] = [];

  for (const ws of workspaces) {
    try {
      await seedAutonomousAgents(ws.id);

      const { data: agents } = await supabaseAdmin
        .from("wm_agent_definitions")
        .select("id")
        .eq("workspace_id", ws.id);

      if (!agents?.length) {
        allResults.push({ workspaceId: ws.id, agentsRun: 0, errors: 0 });
        continue;
      }

      let errors = 0;
      for (const agent of agents) {
        const result = await executeAutonomousAgent(agent.id, ws.id);
        if (!result.success) errors++;
      }

      allResults.push({ workspaceId: ws.id, agentsRun: agents.length, errors });
    } catch (err) {
      console.error(`Cron: workspace ${ws.id} failed:`, err);
      allResults.push({ workspaceId: ws.id, agentsRun: 0, errors: 1 });
    }
  }

  return NextResponse.json({
    message: `Ran agents for ${workspaces.length} workspace(s)`,
    results: allResults,
  });
}

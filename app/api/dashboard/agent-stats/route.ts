import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
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
    if (!wid) return NextResponse.json({ agents: [], stats: {} });

    const [{ data: agents }, { data: conversations }, { data: scenarios }] = await Promise.all([
      supabaseAdmin.from("agents").select("id, name, status, modality, description, created_at, updated_at").eq("workspace_id", wid).order("created_at", { ascending: false }),
      supabaseAdmin.from("conversations").select("id, agent_id, status, created_at, modality").eq("workspace_id", wid),
      supabaseAdmin.from("scenarios").select("id, agent_id"),
    ]);

    const safeAgents = agents || [];
    const safeConvos = conversations || [];
    const safeScenarios = scenarios || [];

    const agentDetails = safeAgents.map((agent) => {
      const agentConvos = safeConvos.filter((c) => c.agent_id === agent.id);
      const agentScenarios = safeScenarios.filter((s) => s.agent_id === agent.id);
      const completed = agentConvos.filter((c) => c.status === "completed").length;
      const active = agentConvos.filter((c) => c.status === "active").length;
      const failed = agentConvos.filter((c) => c.status === "failed").length;
      const total = agentConvos.length;
      const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      return {
        id: agent.id,
        name: agent.name,
        status: agent.status,
        modality: agent.modality,
        description: agent.description,
        createdAt: agent.created_at,
        updatedAt: agent.updated_at,
        scenarios: agentScenarios.length,
        conversations: { total, active, completed, failed },
        successRate,
      };
    });

    const stats = {
      totalAgents: safeAgents.length,
      deployed: safeAgents.filter((a) => a.status === "deployed").length,
      draft: safeAgents.filter((a) => a.status === "draft").length,
      archived: safeAgents.filter((a) => a.status === "archived").length,
      totalConversations: safeConvos.length,
      activeConversations: safeConvos.filter((c) => c.status === "active").length,
      completedConversations: safeConvos.filter((c) => c.status === "completed").length,
      failedConversations: safeConvos.filter((c) => c.status === "failed").length,
    };

    return NextResponse.json({ agents: agentDetails, stats });
  } catch (error) {
    console.error("Agent stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

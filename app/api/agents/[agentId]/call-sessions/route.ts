import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { agentId } = await params;

    // Verify agent belongs to user's workspace
    const { data: agent } = await supabase
      .from("agents")
      .select("workspace_id")
      .eq("id", agentId)
      .single();

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Get user's workspace
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .single();

    if (!profile || profile.workspace_id !== agent.workspace_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch call sessions for this agent
    const { data: callSessions, error } = await supabase
      .from("call_sessions")
      .select("*")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching call sessions:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(callSessions || []);
  } catch (error: any) {
    console.error("Error in call-sessions GET:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

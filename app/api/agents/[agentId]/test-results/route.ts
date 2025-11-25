import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  { params }: { params: { agentId: string } }
) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { agentId } = params;

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

    // Fetch test results
    const { data: testResults, error } = await supabase
      .from("agent_test_results")
      .select("*")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching test results:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(testResults || []);
  } catch (error: any) {
    console.error("Error in test-results GET:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

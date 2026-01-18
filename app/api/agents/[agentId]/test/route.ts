import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { AgentExecutor, ConversationContext } from "@/lib/agent-executor/executor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: { agentId: string } }
) {
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

    const agentId = params.agentId;
    const { userInput, scenarioId, currentStepId, gatheredData = {}, transcript = [] } = await req.json();

    // Verify agent belongs to workspace
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, name, workspace_id")
      .eq("id", agentId)
      .eq("workspace_id", profile.workspace_id)
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Create a test conversation context
    const context: ConversationContext = {
      conversationId: `test-${Date.now()}`,
      agentId: agentId,
      scenarioId: scenarioId || null,
      currentStepId: currentStepId || null,
      gatheredData: gatheredData,
      conversationState: {},
      transcript: transcript,
    };

    // Initialize executor
    const executor = new AgentExecutor(context);

    // Execute the step
    const result = await executor.executeNextStep(userInput || "", 10);

    // Return the result
    return NextResponse.json({
      success: result.success,
      output: result.output,
      nextStepId: result.nextStepId,
      nextScenarioId: result.nextScenarioId,
      gatheredData: executor["context"].gatheredData, // Access private context
      shouldContinue: result.shouldContinue,
      error: result.error,
    });
  } catch (error: any) {
    console.error("Test execution error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




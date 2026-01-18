/**
 * Execute agent step for Media Streams
 * Called by the WebSocket server to get agent responses
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AgentExecutor, ConversationContext } from "@/lib/agent-executor/executor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { conversationId, userInput } = await req.json();

    if (!conversationId || !userInput) {
      return NextResponse.json(
        { error: "Missing conversationId or userInput" },
        { status: 400 }
      );
    }

    // Load conversation
    const { data: conversation } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Add user message to transcript
    const transcript = conversation.transcript || [];
    transcript.push({
      role: "user",
      content: userInput,
      timestamp: new Date().toISOString(),
    });

    // Create execution context
    const context: ConversationContext = {
      conversationId: conversation.id,
      agentId: conversation.agent_id,
      scenarioId: conversation.current_scenario_id,
      currentStepId: conversation.current_step_id,
      gatheredData: conversation.gathered_data || {},
      conversationState: conversation.conversation_state || {},
      transcript,
    };

    // Execute agent step
    const executor = new AgentExecutor(context);
    const result = await executor.executeNextStep(userInput);

    // Update conversation
    const updates: any = {
      transcript: [
        ...transcript,
        {
          role: "assistant",
          content: result.output || "",
          timestamp: new Date().toISOString(),
        },
      ],
      updated_at: new Date().toISOString(),
    };

    if (result.nextStepId !== undefined) {
      updates.current_step_id = result.nextStepId;
    }

    if (result.nextScenarioId) {
      updates.current_scenario_id = result.nextScenarioId;
    }

    if (result.gatheredData) {
      updates.gathered_data = result.gatheredData;
    }

    if (!result.shouldContinue) {
      updates.status = "completed";
    }

    // Update in background (don't wait)
    supabaseAdmin
      .from("conversations")
      .update(updates)
      .eq("id", conversation.id)
      .catch(err => console.error("[Media Stream Execute] DB update error:", err));

    // Get agent voice ID
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("elevenlabs_voice_id")
      .eq("id", conversation.agent_id)
      .single();

    return NextResponse.json({
      success: result.success,
      output: result.output || "",
      voiceId: agent?.elevenlabs_voice_id || null,
      shouldContinue: result.shouldContinue,
    });
  } catch (error: any) {
    console.error("[Media Stream Execute] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to execute agent step" },
      { status: 500 }
    );
  }
}

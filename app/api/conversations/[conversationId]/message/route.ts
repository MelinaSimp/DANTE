/**
 * Send a message in a conversation
 * Processes user input and executes agent steps
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AgentExecutor, ConversationContext } from "@/lib/agent-executor/executor";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { message } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    // Load conversation
    const { data: conversation } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("id", params.conversationId)
      .single();

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Add user message to transcript
    const transcript = conversation.transcript || [];
    transcript.push({
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    });

    await supabaseAdmin
      .from("conversations")
      .update({ transcript })
      .eq("id", params.conversationId);

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
    const result = await executor.executeNextStep(message);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
        message: "I'm sorry, I encountered an error. Please try again.",
      });
    }

    // Update conversation with new step
    const updates: any = {
      updated_at: new Date().toISOString(),
      transcript: [
        ...transcript,
        {
          role: "assistant",
          content: result.output || "",
          timestamp: new Date().toISOString(),
        },
      ],
    };

    if (result.nextStepId !== undefined) {
      updates.current_step_id = result.nextStepId;
    }

    if (result.gatheredData) {
      updates.gathered_data = result.gatheredData;
    }

    if (!result.shouldContinue) {
      updates.status = "completed";
    }

    await supabaseAdmin
      .from("conversations")
      .update(updates)
      .eq("id", params.conversationId);

    return NextResponse.json({
      success: true,
      message: result.output || "",
      nextStepId: result.nextStepId,
      shouldContinue: result.shouldContinue,
      gatheredData: result.gatheredData,
    });
  } catch (error: any) {
    console.error("Message processing error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}












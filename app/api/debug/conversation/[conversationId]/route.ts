/**
 * Debug endpoint to view conversation details and errors
 * GET /api/debug/conversation/[conversationId]
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
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

    // Get conversation with full details
    const { data: conversation, error } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("id", params.conversationId)
      .single();

    if (error || !conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Extract errors from transcript
    const errors = (conversation.transcript || []).filter(
      (msg: any) => msg.role === "system" && msg.content?.includes("ERROR")
    );

    // Get step details if available
    let currentStep = null;
    if (conversation.current_step_id) {
      const { data: step } = await supabaseAdmin
        .from("steps")
        .select("*")
        .eq("id", conversation.current_step_id)
        .single();
      currentStep = step;
    }

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        agent_id: conversation.agent_id,
        current_step_id: conversation.current_step_id,
        current_scenario_id: conversation.current_scenario_id,
        status: conversation.status,
        gathered_data: conversation.gathered_data,
        conversation_state: conversation.conversation_state,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
      },
      transcript: conversation.transcript || [],
      errors,
      currentStep,
      lastMessage: conversation.transcript?.[conversation.transcript.length - 1],
    });
  } catch (error: any) {
    console.error("[Debug] Error fetching conversation:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


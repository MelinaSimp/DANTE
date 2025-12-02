// app/api/twilio/sms/route.ts
// Twilio SMS webhook - handles incoming text messages

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { AgentExecutor, ConversationContext } from "@/lib/agent-executor/executor";
import twilio from "twilio";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // 30 seconds for SMS processing

/**
 * Twilio SMS Webhook
 * POST /api/twilio/sms
 * 
 * Configure this URL in your Twilio phone number settings:
 * Messaging > A MESSAGE COMES IN > Webhook
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const messageSid = formData.get("MessageSid")?.toString() || "";
    const from = formData.get("From")?.toString() || "";
    const to = formData.get("To")?.toString() || "";
    const body = formData.get("Body")?.toString() || "";

    console.log("[Twilio SMS] Incoming message:", { messageSid, from, to, body });

    if (!to || !from || !body) {
      console.error("[Twilio SMS] Missing required fields");
      return new NextResponse("Missing required fields", { status: 400 });
    }

    // Normalize phone number for matching
    const normalizedTo = normalizePhone(to);
    if (!normalizedTo) {
      console.error("[Twilio SMS] Invalid phone number format:", to);
      return new NextResponse("Invalid phone number", { status: 400 });
    }

    // Generate all possible formats of the phone number
    const possibleFormats = [
      normalizedTo,
      to,
      normalizedTo?.replace(/^\+1/, ""),
      to?.replace(/^\+1/, ""),
      normalizedTo?.replace(/^\+1/, "").replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3"),
      to?.replace(/^\+1/, "").replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3"),
    ].filter(Boolean) as string[];

    const uniqueFormats = [...new Set(possibleFormats)];

    console.log("[Twilio SMS] Looking for agent with phone number formats:", uniqueFormats);

    // Find agent by phone number
    let { data: agent } = await supabaseAdmin
      .from("agents")
      .select("id, workspace_id, name, status, phone_number")
      .in("phone_number", uniqueFormats)
      .maybeSingle();

    // Try case-insensitive partial matching if not found
    if (!agent) {
      const { data: allAgents } = await supabaseAdmin
        .from("agents")
        .select("id, workspace_id, name, phone_number, status");

      if (allAgents) {
        for (const candidate of allAgents) {
          if (!candidate.phone_number) continue;
          
          const normalizedCandidate = normalizePhone(candidate.phone_number);
          if (normalizedCandidate === normalizedTo || normalizedCandidate === to) {
            const { data: fullAgent } = await supabaseAdmin
              .from("agents")
              .select("id, workspace_id, name, status, phone_number")
              .eq("id", candidate.id)
              .single();
            if (fullAgent) {
              agent = fullAgent;
              break;
            }
          }
        }
      }
    }

    if (!agent) {
      console.error("[Twilio SMS] Agent not found for phone number:", to);
      console.error("[Twilio SMS] Tried formats:", uniqueFormats);
      // Get all agents for debugging
      const { data: allAgents } = await supabaseAdmin
        .from("agents")
        .select("id, name, phone_number, status");
      console.error("[Twilio SMS] All agents in database:", allAgents);
      // Return empty response (Twilio will not send anything)
      return new NextResponse("", { status: 200 });
    }

    console.log("[Twilio SMS] Found agent:", agent.id);

    // Get or create conversation
    const channelId = `sms-${from}-${to}`;
    
    // Try to find existing active conversation
    let { data: conversation } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("agent_id", agent.id)
      .eq("channel_id", channelId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // If no active conversation, create one
    if (!conversation) {
      // Get first scenario
      const { data: scenarios } = await supabaseAdmin
        .from("scenarios")
        .select("id")
        .eq("agent_id", agent.id)
        .order("created_at", { ascending: true })
        .limit(1);

      const scenarioId = scenarios && scenarios.length > 0 ? scenarios[0].id : null;

      // Get first step
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

      const { data: newConversation, error: convError } = await supabaseAdmin
        .from("conversations")
        .insert({
          agent_id: agent.id,
          workspace_id: agent.workspace_id,
          modality: "chat", // SMS is treated as chat
          channel_id: channelId,
          from_number: from,
          to_number: to,
          current_scenario_id: scenarioId,
          current_step_id: currentStepId,
          status: "active",
          gathered_data: {},
          conversation_state: {},
          transcript: [],
        })
        .select()
        .single();

      if (convError || !newConversation) {
        console.error("[Twilio SMS] Failed to create conversation:", convError);
        return new NextResponse("Failed to create conversation", { status: 500 });
      }

      conversation = newConversation;
    }

    // Add user message to transcript
    const transcript = conversation.transcript || [];
    transcript.push({
      role: "user",
      content: body,
      timestamp: new Date().toISOString(),
    });

    // Update conversation with user message
    await supabaseAdmin
      .from("conversations")
      .update({ transcript })
      .eq("id", conversation.id);

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
    const result = await executor.executeNextStep(body);

    // Prepare response message
    let responseMessage = "";
    if (result.success && result.output) {
      responseMessage = result.output;
    } else if (result.error) {
      responseMessage = "I'm sorry, I encountered an error. Please try again.";
    } else {
      responseMessage = "I'm here to help! How can I assist you?";
    }

    // Update conversation with assistant response
    const updatedTranscript = [
      ...transcript,
      {
        role: "assistant",
        content: responseMessage,
        timestamp: new Date().toISOString(),
      },
    ];

    const updates: any = {
      transcript: updatedTranscript,
      updated_at: new Date().toISOString(),
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
      .eq("id", conversation.id);

    // Get Twilio credentials - try database first, then environment variables
    let accountSid: string | null = null;
    let authToken: string | null = null;

    // Try database first
    const { data: twilioCreds } = await supabaseAdmin
      .from("twilio_credentials")
      .select("account_sid, auth_token")
      .eq("workspace_id", agent.workspace_id)
      .maybeSingle();

    if (twilioCreds?.account_sid && twilioCreds?.auth_token) {
      accountSid = twilioCreds.account_sid;
      authToken = twilioCreds.auth_token;
      console.log("[Twilio SMS] Using credentials from database");
    } else {
      // Fallback to environment variables
      accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_MASTER_ACCOUNT_SID || null;
      authToken = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_MASTER_AUTH_TOKEN || null;
      
      if (accountSid && authToken) {
        console.log("[Twilio SMS] Using credentials from environment variables");
      } else {
        console.error("[Twilio SMS] Twilio credentials not found in database or environment");
        console.error("[Twilio SMS] Workspace ID:", agent.workspace_id);
        console.error("[Twilio SMS] Available env vars:", {
          hasAccountSid: !!process.env.TWILIO_ACCOUNT_SID,
          hasAuthToken: !!process.env.TWILIO_AUTH_TOKEN,
          hasMasterAccountSid: !!process.env.TWILIO_MASTER_ACCOUNT_SID,
          hasMasterAuthToken: !!process.env.TWILIO_MASTER_AUTH_TOKEN,
        });
        return new NextResponse("", { status: 200 });
      }
    }

    if (!accountSid || !authToken) {
      console.error("[Twilio SMS] No valid credentials available");
      return new NextResponse("", { status: 200 });
    }

    // Send SMS response via Twilio
    const twilioClient = twilio(accountSid, authToken);

    try {
      const message = await twilioClient.messages.create({
        body: responseMessage,
        from: to, // The agent's phone number
        to: from, // The customer's phone number
      });

      console.log("[Twilio SMS] Response sent successfully. Message SID:", message.sid);
    } catch (twilioError: any) {
      console.error("[Twilio SMS] Failed to send SMS:", twilioError);
      
      // Log error with handling
      const { logError, handleTwilioError } = await import("@/lib/errors/twilio-errors");
      await logError({
        type: "twilio_sms_error",
        source: "/api/twilio/sms",
        error: twilioError,
        context: { from, to, conversationId: conversation.id },
        timestamp: new Date().toISOString(),
        severity: "high",
        workspaceId: agent.workspace_id
      });
      
      const handled = await handleTwilioError(twilioError, {
        source: "/api/twilio/sms",
        conversationId: conversation.id,
        workspaceId: agent.workspace_id,
        from,
        to
      });
      
      // Still return 200 to Twilio (we don't want to retry)
    }

    // Return empty TwiML response (Twilio doesn't need XML for SMS)
    return new NextResponse("", { status: 200 });
  } catch (error: any) {
    console.error("[Twilio SMS] Error:", error);
    
    // Log error
    const { logError } = await import("@/lib/errors/logger");
    await logError({
      type: "twilio_sms_unhandled_error",
      source: "/api/twilio/sms",
      error,
      context: {},
      timestamp: new Date().toISOString(),
      severity: "high"
    });
    
    // Return empty response to avoid Twilio retries
    return new NextResponse("", { status: 200 });
  }
}


import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { AgentExecutor, ConversationContext } from "@/lib/agent-executor/executor";
import { formatRetellResponse } from "@/lib/retell/response";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // Retell allows longer timeouts

/**
 * Retell AI Webhook Handler (Dynamic Route)
 * POST /api/retell/webhook/[callId] or /api/retell/webhook
 * 
 * Retell may append call ID to the URL: /api/retell/webhook/call_xxx
 * This dynamic route handles both formats
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  try {
    const resolvedParams = await params;
    const pathSegments = resolvedParams.path || [];
    
    // Extract call ID from path if present (e.g., /api/retell/webhook/call_xxx)
    const callIdFromPath = pathSegments.length > 0 ? pathSegments[0] : null;
    
    const body = await req.json();
    
    console.log("[Retell] Webhook received:", JSON.stringify(body, null, 2));
    console.log("[Retell] Path segments:", pathSegments);
    console.log("[Retell] Call ID from path:", callIdFromPath);
    console.log("[Retell] Event type:", body.event);
    
    // Retell webhook structure (for Custom LLM):
    // {
    //   event: "call_start" | "user_message" | "call_end",
    //   call?: {
    //     call_id: string,
    //     from_number: string,
    //     to_number: string,
    //   },
    //   message?: {
    //     role: "user" | "assistant",
    //     content: string
    //   }
    // }

    const event = body.event || body.type;
    const call = body.call || body.call_data || (callIdFromPath ? { call_id: callIdFromPath } : null);
    const message = body.message || body.data;

    // Handle call_start event
    if (event === "call_start" || event === "call_connected" || !event) {
      console.log("[Retell] Call started");
      
      const callId = call?.call_id || callIdFromPath || body.call_id;
      
      if (!callId) {
        console.error("[Retell] Call started but no call_id found");
        return NextResponse.json({ error: "Missing call_id" }, { status: 400 });
      }

      const phoneNumber = call?.to_number || body.to_number || body.phone_number?.number;
      const customerNumber = call?.from_number || body.from_number || body.customer?.number;

      console.log("[Retell] Call info:", { callId, phoneNumber, customerNumber });

      // Find agent by phone number
      if (phoneNumber) {
        const normalizedPhone = normalizePhone(phoneNumber);
        if (!normalizedPhone) {
          console.error("[Retell] Invalid phone number format:", phoneNumber);
          return NextResponse.json(
            { error: "Invalid phone number format" },
            { status: 400 }
          );
        }

        const possibleFormats = [
          normalizedPhone,
          phoneNumber,
          normalizedPhone?.replace(/^\+1/, ""),
          phoneNumber?.replace(/^\+1/, ""),
        ].filter(Boolean) as string[];

        const uniqueFormats = [...new Set(possibleFormats)];

        let { data: agent } = await supabaseAdmin
          .from("agents")
          .select("id, workspace_id, name, elevenlabs_voice_id")
          .in("phone_number", uniqueFormats)
          .in("modality", ["voice", "multi-modal"])
          .eq("status", "deployed")
          .limit(1)
          .maybeSingle();

        if (!agent) {
          console.error("[Retell] No agent found for phone number:", uniqueFormats);
          return NextResponse.json(
            { error: "Agent not found" },
            { status: 404 }
          );
        }

        // Get greeting message
        const { data: scenarios } = await supabaseAdmin
          .from("scenarios")
          .select("id")
          .eq("agent_id", agent.id)
          .order("created_at", { ascending: true })
          .limit(1);

        const scenarioId = scenarios && scenarios.length > 0 ? scenarios[0].id : null;

        let greeting = "Hello! How can I help you today?";
        if (scenarioId) {
          const { data: firstSayStep } = await supabaseAdmin
            .from("steps")
            .select("ai_message")
            .eq("scenario_id", scenarioId)
            .eq("type", "say")
            .order("sort_order", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (firstSayStep?.ai_message) {
            greeting = firstSayStep.ai_message;
          }
        }

        // Create conversation in background
        let currentStepId: string | null = null;
        if (scenarioId) {
          const { data: allSteps } = await supabaseAdmin
            .from("steps")
            .select("id, type, sort_order")
            .eq("scenario_id", scenarioId)
            .order("sort_order", { ascending: true });

          if (allSteps && allSteps.length > 0) {
            const sayStep = allSteps.find(s => s.type === "say");
            if (sayStep) {
              const greetingIndex = allSteps.findIndex(s => s.id === sayStep.id);
              if (greetingIndex >= 0 && greetingIndex < allSteps.length - 1) {
                currentStepId = allSteps[greetingIndex + 1].id;
              }
            } else {
              currentStepId = allSteps[0].id;
            }
          }
        }

        supabaseAdmin
          .from("conversations")
          .insert({
            agent_id: agent.id,
            workspace_id: agent.workspace_id,
            modality: "voice",
            channel_id: callId,
            from_number: customerNumber,
            to_number: phoneNumber,
            current_scenario_id: scenarioId,
            current_step_id: currentStepId,
            status: "active",
            gathered_data: {},
            conversation_state: {},
            transcript: [],
          })
          .select()
          .single()
          .then(({ data: conversation, error }) => {
            if (error) {
              console.error("[Retell] Failed to create conversation (background):", error);
            } else {
              console.log("[Retell] Conversation created (background):", conversation?.id);
            }
          })
          .catch(err => {
            console.error("[Retell] Conversation creation error (background):", err);
          });

        // Return greeting immediately
        const response = formatRetellResponse({
          response: greeting,
          endCall: false,
        });

        console.log("[Retell] Returning greeting:", JSON.stringify(response, null, 2));
        return NextResponse.json(response);
      } else {
        // No phone number yet, return default greeting
        const response = formatRetellResponse({
          response: "Hello! How can I help you today?",
          endCall: false,
        });
        return NextResponse.json(response);
      }
    }

    // Handle user_message event
    if (event === "user_message" || (message && message.role === "user")) {
      console.log("[Retell] User message received");
      
      const callId = call?.call_id || callIdFromPath || body.call_id;
      
      if (!callId) {
        console.error("[Retell] User message but no call_id found");
        return NextResponse.json({ error: "Missing call_id" }, { status: 400 });
      }

      const userInput = message?.content || body.content || body.text || "";

      console.log("[Retell] User input:", userInput.substring(0, 100));

      // Find conversation
      const { data: conversation } = await supabaseAdmin
        .from("conversations")
        .select("*")
        .eq("channel_id", callId)
        .eq("modality", "voice")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!conversation) {
        console.error("[Retell] Conversation not found for call ID:", callId);
        return NextResponse.json(
          { error: "Conversation not found" },
          { status: 404 }
        );
      }

      // Get agent
      const { data: agent } = await supabaseAdmin
        .from("agents")
        .select("id, workspace_id, name, elevenlabs_voice_id")
        .eq("id", conversation.agent_id)
        .single();

      if (!agent) {
        console.error("[Retell] Agent not found");
        return NextResponse.json(
          { error: "Agent not found" },
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
      const result = await executor.executeNextStep(userInput);

      if (!result.success) {
        console.error("[Retell] Agent execution failed:", result.error);
        return NextResponse.json(
          formatRetellResponse({
            response: "I'm sorry, I encountered an error. Please try again.",
            endCall: false,
          })
        );
      }

      // Update conversation with assistant response
      const updatedTranscript = [
        ...transcript,
        {
          role: "assistant",
          content: result.output || "",
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

      if (result.nextScenarioId) {
        updates.current_scenario_id = result.nextScenarioId;
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

      // Return response to Retell
      const retellResponse = formatRetellResponse({
        response: result.output || "I'm here to help! How can I assist you?",
        endCall: !result.shouldContinue,
      });

      console.log("[Retell] Returning response:", JSON.stringify(retellResponse, null, 2));
      return NextResponse.json(retellResponse);
    }

    // Handle call_end event
    if (event === "call_end" || event === "call_ended") {
      console.log("[Retell] Call ended");
      
      const callId = call?.call_id || callIdFromPath || body.call_id;
      if (callId) {
        await supabaseAdmin
          .from("conversations")
          .update({ 
            status: "completed",
            updated_at: new Date().toISOString()
          })
          .eq("channel_id", callId)
          .eq("modality", "voice");
      }

      return NextResponse.json({ success: true });
    }

    // Unknown event type - acknowledge anyway
    console.warn("[Retell] Unknown event type:", event);
    console.log("[Retell] Full body:", JSON.stringify(body, null, 2));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Retell] Webhook error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Also handle GET requests (Retell might be checking if endpoint exists)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  try {
    const resolvedParams = await params;
    const pathSegments = resolvedParams.path || [];
    console.log("[Retell] GET request received");
    console.log("[Retell] Path:", req.nextUrl.pathname);
    console.log("[Retell] Path segments:", pathSegments);
    
    // Health check endpoint
    return NextResponse.json({ 
      status: "ok", 
      message: "Retell webhook endpoint is active",
      path: pathSegments,
      fullPath: req.nextUrl.pathname
    });
  } catch (error: any) {
    console.error("[Retell] GET error:", error);
    return NextResponse.json({ 
      status: "ok", 
      message: "Retell webhook endpoint is active (with error)"
    });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { AgentExecutor, ConversationContext } from "@/lib/agent-executor/executor";
import { formatVapiResponse } from "@/lib/vapi/response";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // Vapi allows longer timeouts

// In-memory cache to store call info from speech-update events
// Key: call ID, Value: { callId, phoneNumber, customerNumber }
const callInfoCache = new Map<string, { callId: string; phoneNumber: string; customerNumber: string }>();

/**
 * Vapi Webhook Handler
 * POST /api/vapi/webhook
 * 
 * This endpoint receives webhooks from Vapi for voice calls
 * Configure this URL in your Vapi assistant settings:
 * Settings > Server URL > https://your-domain.com/api/vapi/webhook
 * 
 * Vapi will call this endpoint:
 * 1. When a call starts (with system message)
 * 2. When user speaks (with user message)
 * 3. When assistant needs to respond (with assistant message)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Log request headers to see if Vapi includes call context
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });
    console.log("[Vapi] Request headers:", JSON.stringify(headers, null, 2));
    
    // Log full payload for debugging (truncate if too long)
    const bodyStr = JSON.stringify(body, null, 2);
    if (bodyStr.length > 2000) {
      console.log("[Vapi] Webhook received (truncated):", bodyStr.substring(0, 2000) + "...");
    } else {
      console.log("[Vapi] Webhook received:", bodyStr);
    }
    console.log("[Vapi] Message type:", body.message?.type);
    console.log("[Vapi] Message role:", body.message?.role);
    console.log("[Vapi] Body keys:", Object.keys(body));
    console.log("[Vapi] Has body.call:", !!body.call);
    console.log("[Vapi] Has body.message:", !!body.message);
    console.log("[Vapi] Has body.phoneNumber:", !!body.phoneNumber);
    
    // Handle end-of-call-report FIRST (before other message extraction)
    // This is sent after the call ends and should be acknowledged immediately
    if (body.message?.type === "end-of-call-report") {
      console.log("[Vapi] End-of-call-report received");
      // Extract call ID from various possible locations
      const callId = body.call?.id || body.message?.call?.id;
      
      console.log("[Vapi] Extracted call ID from end-of-call-report:", callId);
      
      if (callId) {
        // Update conversation status
        const { error: updateError } = await supabaseAdmin
          .from("conversations")
          .update({ 
            status: "completed",
            updated_at: new Date().toISOString()
          })
          .eq("channel_id", callId)
          .eq("modality", "voice");
        
        if (updateError) {
          console.error("[Vapi] Failed to update conversation status:", updateError);
        } else {
          console.log("[Vapi] Conversation marked as completed for call:", callId);
        }
      } else {
        console.warn("[Vapi] Could not find call ID in end-of-call-report");
      }
      
      // Acknowledge the report (always return success, even if we couldn't find the call)
      return NextResponse.json({ success: true });
    }
    
    // Handle request-start (call initiated) - Vapi sends this when call starts
    // CRITICAL: Vapi might need a DIRECT response to request-start before it will
    // continue using the Server URL for subsequent messages
    if (body.message?.type === "request-start" || body.type === "request-start") {
      console.log("[Vapi] Call started (request-start) - Responding directly");
      
      if (!body.call?.id) {
        console.error("[Vapi] request-start received but no call.id found");
        return NextResponse.json({ error: "Missing call information in request-start" }, { status: 400 });
      }

      // Extract call info immediately
      const vapiCallId = body.call.id;
      const phoneNumber = body.phoneNumber?.number || body.call.phoneNumber;
      const customerNumber = body.customer?.number || body.call.customer?.number;

      console.log("[Vapi] request-start call info:", { vapiCallId, phoneNumber, customerNumber });

      // Find agent by phone number
      const normalizedPhone = normalizePhone(phoneNumber);
      if (!normalizedPhone) {
        console.error("[Vapi] Invalid phone number format:", phoneNumber);
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
        console.error("[Vapi] No agent found for request-start");
        return NextResponse.json(
          { error: "Agent not found" },
          { status: 404 }
        );
      }

      // Create conversation
      const { data: scenarios } = await supabaseAdmin
        .from("scenarios")
        .select("id")
        .eq("agent_id", agent.id)
        .order("created_at", { ascending: true })
        .limit(1);

      const scenarioId = scenarios && scenarios.length > 0 ? scenarios[0].id : null;

      let currentStepId: string | null = null;
      if (scenarioId) {
        const { data: allSteps } = await supabaseAdmin
          .from("steps")
          .select("id, type, sort_order, ai_message")
          .eq("scenario_id", scenarioId)
          .order("sort_order", { ascending: true });

        if (allSteps && allSteps.length > 0) {
          const sayStep = allSteps.find(s => s.type === "say");
          if (sayStep) {
            currentStepId = sayStep.id;
            const greetingIndex = allSteps.findIndex(s => s.id === sayStep.id);
            if (greetingIndex >= 0 && greetingIndex < allSteps.length - 1) {
              currentStepId = allSteps[greetingIndex + 1].id;
            }
          } else {
            currentStepId = allSteps[0].id;
          }
        }
      }

      // Get greeting message FIRST (before any DB operations)
      // This ensures we respond quickly (< 2 seconds)
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

      // CRITICAL: Return DIRECT response to request-start IMMEDIATELY
      // Vapi requires < 2 second response time
      // Use messages array format (not just "response" field)
      const response = formatVapiResponse({
        response: greeting,
        endCall: false,
        voiceId: agent.elevenlabs_voice_id,
      });

      console.log("[Vapi] Returning direct response to request-start:", JSON.stringify(response, null, 2));

      // Create conversation in background (fire-and-forget)
      // Don't wait for it - respond immediately
      supabaseAdmin
        .from("conversations")
        .insert({
          agent_id: agent.id,
          workspace_id: agent.workspace_id,
          modality: "voice",
          channel_id: vapiCallId,
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
            console.error("[Vapi] Failed to create conversation (background):", error);
          } else {
            console.log("[Vapi] Conversation created (background):", conversation?.id);
          }
        })
        .catch(err => {
          console.error("[Vapi] Conversation creation error (background):", err);
        });

      // Return response immediately (don't wait for DB)
      return NextResponse.json(response);
    }

    // Vapi can send webhooks in multiple formats:
    // 1. Regular webhook format (nested structure)
    // 2. Custom function call format (flat parameters from LLM - but LLM doesn't know real values!)
    // 3. Speech-update/status-update events

    let message: any;
    let call: any;
    let assistant: any;

    // Check if this is a custom function call
    // IMPORTANT: LLM generates fake values like "12345", so we MUST extract real call info from body.call
    if (body.message?.type === "function-call" && body.message?.functionCall) {
      console.log("[Vapi] Custom function call detected");
      const functionCall = body.message.functionCall;
      const params = functionCall.parameters || {};
      console.log("[Vapi] LLM-generated params:", params);
      
      // Extract REAL call info from body.call (Vapi always includes this in function calls)
      // The LLM parameters have fake values, but body.call has the real data
      const realCall = body.call;
      const userMessage = params.message || params.content || "";
      
      if (realCall?.id) {
        // Use real call info from body.call
        message = {
          role: "user",
          content: userMessage,
        };
        call = {
          id: realCall.id,
          phoneNumber: body.phoneNumber?.number || realCall.phoneNumber || realCall.phoneNumberId,
          customer: realCall.customer || body.customer,
        };
        assistant = body.assistant;
        console.log("[Vapi] Using real call info from body.call:", {
          callId: realCall.id,
          phoneNumber: call.phoneNumber,
          customerNumber: call.customer?.number,
          userMessage: userMessage.substring(0, 100),
        });
      } else {
        // Fallback: try to extract from any available structure
        console.warn("[Vapi] Could not find real call ID in body.call, trying fallback");
        message = {
          role: "user",
          content: userMessage,
        };
        call = body.call || body.message?.call;
        assistant = body.assistant || body.message?.assistant;
      }
    } else {
      // Regular webhook format (nested structure)
      message = body.message;
      call = body.call || body.message?.call;
      assistant = body.assistant || body.message?.assistant;
    }

    // Vapi webhook structure (regular format):
    // {
    //   message: {
    //     role: "user" | "assistant" | "system",
    //     content: string
    //   },
    //   call: {
    //     id: string,  // Vapi call ID
    //     phoneNumber: string,  // Phone number that was called
    //     customer: {
    //       number: string  // Customer's phone number
    //     }
    //   },
    //   assistant: {
    //     id: string  // Vapi assistant ID
    //   }
    // }

    // Handle speech-update events (assistant finished speaking, etc.)
    if (message?.type === "speech-update" || body.message?.type === "speech-update") {
      const speechMessage = message || body.message;
      console.log("[Vapi] Speech update received:", speechMessage?.status);
      // Extract call info from nested structure and cache it for function calls
      const callId = speechMessage?.call?.id || call?.id || body.call?.id;
      const phoneNumber = speechMessage?.phoneNumber?.number || body.phoneNumber?.number || speechMessage?.call?.phoneNumber;
      const customerNumber = speechMessage?.customer?.number || body.customer?.number || speechMessage?.call?.customer?.number;
      
      if (callId) {
        // Cache call info for use in function calls
        callInfoCache.set(callId, {
          callId,
          phoneNumber: phoneNumber || "",
          customerNumber: customerNumber || "",
        });
        console.log("[Vapi] Cached call info for function calls:", { callId, phoneNumber, customerNumber });
      }
      
      if (callId && speechMessage?.status === "stopped") {
        // Assistant finished speaking - we can process if needed
        // But this isn't a user message, so we don't need to respond
        console.log("[Vapi] Assistant finished speaking, waiting for user input");
      }
      return NextResponse.json({ success: true });
    }

    // Handle status updates (call ended, etc.) - just acknowledge
    if (message?.type === "status-update" || body.message?.type === "status-update") {
      const statusMessage = message || body.message;
      console.log("[Vapi] Status update received:", statusMessage?.status);
      // Extract call info from nested structure
      const callId = statusMessage?.call?.id || call?.id || body.call?.id;
      // Update conversation status if call ended
      if (statusMessage?.status === "ended" && callId) {
        await supabaseAdmin
          .from("conversations")
          .update({ status: "completed" })
          .eq("channel_id", callId)
          .eq("modality", "voice");
        console.log("[Vapi] Conversation marked as completed for call:", callId);
      }
      return NextResponse.json({ success: true });
    }


    // Extract call information - can be nested in message.call or at top level
    // Vapi can send call info in multiple places, check all of them
    const actualCall = message?.call || call || body.call || body.message?.call;
    const actualPhoneNumber = message?.phoneNumber || body.phoneNumber || body.message?.phoneNumber;
    const actualCustomer = message?.customer || body.customer || body.message?.customer;

    // For real-time conversation messages, we need call information
    if (!actualCall || !actualCall.id) {
      // Try to find call ID in alternative locations
      const possibleCallId = 
        body.call?.id || 
        body.message?.call?.id || 
        body.callId || 
        body.call_id ||
        body.phoneNumber?.id; // Phone number ID might be used as call ID
      
      if (possibleCallId) {
        console.log("[Vapi] Found call ID in alternative location:", possibleCallId);
        actualCall = {
          id: possibleCallId,
          phoneNumber: body.phoneNumber?.number || actualPhoneNumber?.number,
          customer: actualCustomer || body.customer,
        };
        // Also update phoneNumber and customer if we found them
        if (!actualPhoneNumber && body.phoneNumber) {
          actualPhoneNumber = body.phoneNumber;
        }
        if (!actualCustomer && body.customer) {
          actualCustomer = body.customer;
        }
      } else {
        // Log the full body structure to debug
        console.error("[Vapi] Missing call information - Full debug info:", {
          hasMessageCall: !!message?.call,
          hasCall: !!call,
          hasBodyCall: !!body.call,
          hasBodyMessageCall: !!body.message?.call,
          messageType: message?.type,
          messageRole: message?.role,
          bodyKeys: Object.keys(body),
          messageKeys: message ? Object.keys(message) : null,
          bodyCallId: body.call?.id,
          bodyMessageCallId: body.message?.call?.id,
          bodyCallIdField: body.callId,
          bodyPhoneNumberId: body.phoneNumber?.id,
          // Log first 1000 chars of body for debugging
          bodyPreview: JSON.stringify(body, null, 2).substring(0, 1000),
        });
        
        return NextResponse.json(
          { 
            error: "Missing call information",
            received: {
              hasCall: !!body.call,
              hasMessage: !!body.message,
              hasPhoneNumber: !!body.phoneNumber,
              messageType: body.message?.type,
            }
          },
          { status: 400 }
        );
      }
    }

    const vapiCallId = actualCall.id;
    const phoneNumber = actualPhoneNumber?.number || actualCall.phoneNumber || actualCall.phoneNumberId || body.phoneNumber?.number; // Phone number that was called
    const customerNumber = actualCustomer?.number || actualCall.customer?.number || actualCall.from; // Customer's phone number

    console.log("[Vapi] Call details:", {
      vapiCallId,
      phoneNumber,
      customerNumber,
      messageRole: message?.role,
      messageContent: message?.content?.substring(0, 100),
    });

    // Normalize phone number for matching (same logic as Twilio handler)
    const normalizedPhone = normalizePhone(phoneNumber);
    if (!normalizedPhone) {
      console.error("[Vapi] Invalid phone number format:", phoneNumber);
      return NextResponse.json(
        { error: "Invalid phone number format" },
        { status: 400 }
      );
    }

    // Generate all possible formats of the phone number (same as Twilio handler)
    const possibleFormats = [
      normalizedPhone,
      phoneNumber,
      normalizedPhone?.replace(/^\+1/, ""),
      phoneNumber?.replace(/^\+1/, ""),
      normalizedPhone?.replace(/^\+1/, "").replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3"),
      phoneNumber?.replace(/^\+1/, "").replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3"),
    ].filter(Boolean) as string[];

    const uniqueFormats = [...new Set(possibleFormats)];

    console.log("[Vapi] Looking for agent with phone number formats:", uniqueFormats);

    // Find agent by phone number (same logic as Twilio handler)
    // ONLY voice or multi-modal agents (not chat-only)
    let { data: agent } = await supabaseAdmin
      .from("agents")
      .select("id, workspace_id, name, status, phone_number, elevenlabs_voice_id, is_specialist, parent_agent_id, modality")
      .in("phone_number", uniqueFormats)
      .in("modality", ["voice", "multi-modal"])
      .eq("status", "deployed")
      .order("is_specialist", { ascending: true })
      .order("parent_agent_id", { ascending: true, nullsFirst: true })
      .order("modality", { ascending: true })
      .limit(1)
      .maybeSingle();

    // If still not found, try case-insensitive partial matching (same as Twilio handler)
    if (!agent) {
      const { data: allDeployedAgents } = await supabaseAdmin
        .from("agents")
        .select("id, name, phone_number, status, is_specialist, parent_agent_id, modality")
        .in("modality", ["voice", "multi-modal"])
        .eq("status", "deployed")
        .order("is_specialist", { ascending: true })
        .order("parent_agent_id", { ascending: true, nullsFirst: true })
        .order("modality", { ascending: true });

      if (allDeployedAgents) {
        // First pass: look for main receptionist (non-specialist)
        for (const candidate of allDeployedAgents) {
          if (!candidate.phone_number || candidate.is_specialist) continue;
          
          const normalizedCandidate = normalizePhone(candidate.phone_number);
          if (normalizedCandidate === normalizedPhone || normalizedCandidate === phoneNumber) {
            const { data: fullAgent } = await supabaseAdmin
              .from("agents")
              .select("id, workspace_id, name, status, phone_number, elevenlabs_voice_id, is_specialist, parent_agent_id, modality")
              .eq("id", candidate.id)
              .single();
            if (fullAgent) {
              agent = fullAgent;
              console.log("[Vapi] Found main receptionist agent:", fullAgent);
              break;
            }
          }
        }
        
        // Second pass: if no main receptionist found, look for specialists
        if (!agent) {
          for (const candidate of allDeployedAgents) {
            if (!candidate.phone_number || !candidate.is_specialist) continue;
            
            const normalizedCandidate = normalizePhone(candidate.phone_number);
            if (normalizedCandidate === normalizedPhone || normalizedCandidate === phoneNumber) {
              const { data: fullAgent } = await supabaseAdmin
                .from("agents")
                .select("id, workspace_id, name, status, phone_number, elevenlabs_voice_id, is_specialist, parent_agent_id, modality")
                .eq("id", candidate.id)
                .single();
              if (fullAgent) {
                agent = fullAgent;
                console.log("[Vapi] Found specialist agent:", fullAgent);
                break;
              }
            }
          }
        }
      }
    }

    if (!agent) {
      console.error("[Vapi] No voice/multi-modal agent found for phone number:", uniqueFormats);
      return NextResponse.json(
        { error: "Agent not found for this phone number" },
        { status: 404 }
      );
    }

    console.log("[Vapi] Found agent:", agent.id, agent.name);
    console.log("[Vapi] Agent ElevenLabs voice ID:", agent.elevenlabs_voice_id);

    // Handle system message (call start)
    if (message?.role === "system") {
      console.log("[Vapi] Call started, creating conversation...");
      
      // Get first scenario
      const { data: scenarios } = await supabaseAdmin
        .from("scenarios")
        .select("id")
        .eq("agent_id", agent.id)
        .order("created_at", { ascending: true })
        .limit(1);

      const scenarioId = scenarios && scenarios.length > 0 ? scenarios[0].id : null;
      
      // Get first step
      let currentStepId: string | null = null;
      if (scenarioId) {
        const { data: allSteps } = await supabaseAdmin
          .from("steps")
          .select("id, type, sort_order")
          .eq("scenario_id", scenarioId)
          .order("sort_order", { ascending: true });
        
        if (allSteps && allSteps.length > 0) {
          // Find first Say step for greeting, or use first step
          const sayStep = allSteps.find(s => s.type === "say");
          if (sayStep) {
            currentStepId = sayStep.id;
            // Set next step (after greeting)
            const greetingIndex = allSteps.findIndex(s => s.id === sayStep.id);
            if (greetingIndex >= 0 && greetingIndex < allSteps.length - 1) {
              currentStepId = allSteps[greetingIndex + 1].id;
            }
          } else {
            currentStepId = allSteps[0].id;
          }
        }
      }

      // Create conversation
      const { data: conversation, error: conversationError } = await supabaseAdmin
        .from("conversations")
        .insert({
          agent_id: agent.id,
          workspace_id: agent.workspace_id,
          modality: "voice",
          channel_id: vapiCallId, // Store Vapi call ID instead of Twilio CallSid
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
        .single();

      if (conversationError || !conversation) {
        console.error("[Vapi] Failed to create conversation:", conversationError);
        return NextResponse.json(
          { error: "Failed to create conversation" },
          { status: 500 }
        );
      }

      console.log("[Vapi] Conversation created:", conversation.id);

      // Execute first Say step (greeting) if exists
      if (scenarioId && currentStepId) {
        const { data: firstSayStep } = await supabaseAdmin
          .from("steps")
          .select("id, type, ai_message")
          .eq("scenario_id", scenarioId)
          .eq("type", "say")
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (firstSayStep && firstSayStep.ai_message) {
          // Return greeting response
          const response = formatVapiResponse({
            response: firstSayStep.ai_message,
            endCall: false,
            voiceId: agent.elevenlabs_voice_id,
          });
          console.log("[Vapi] Returning greeting response with voice:", JSON.stringify(response, null, 2));
          return NextResponse.json(response);
        }
      }

      // No greeting configured, return default
      const defaultResponse = formatVapiResponse({
        response: "Hello! How can I help you today?",
        endCall: false,
        voiceId: agent.elevenlabs_voice_id,
      });
      console.log("[Vapi] Returning default greeting with voice:", JSON.stringify(defaultResponse, null, 2));
      return NextResponse.json(defaultResponse);
    }

    // Handle user message (user spoke)
    if (message?.role === "user" && message?.content) {
      const userInput = message.content.trim();
      console.log("[Vapi] User message received:", userInput.substring(0, 100));

      // Find conversation by Vapi call ID
      const { data: conversation } = await supabaseAdmin
        .from("conversations")
        .select("*")
        .eq("channel_id", vapiCallId)
        .eq("modality", "voice")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!conversation) {
        console.error("[Vapi] Conversation not found for call ID:", vapiCallId);
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
        console.error("[Vapi] Agent execution failed:", result.error);
        return NextResponse.json(
          formatVapiResponse({
            response: "I'm sorry, I encountered an error. Please try again.",
            endCall: false,
            voiceId: agent.elevenlabs_voice_id,
          })
        );
      }

      // Update conversation with assistant response and state
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

      // Return response to Vapi
      const vapiResponse = formatVapiResponse({
        response: result.output || "I'm here to help! How can I assist you?",
        endCall: !result.shouldContinue,
        voiceId: agent.elevenlabs_voice_id,
      });
      console.log("[Vapi] Returning response with voice:", JSON.stringify(vapiResponse, null, 2));
      return NextResponse.json(vapiResponse);
    }

    // Handle assistant message (Vapi asking for response)
    if (message?.role === "assistant") {
      // This is Vapi asking us what to say next
      // Usually happens after we've already responded, so we can return empty or continue
      console.log("[Vapi] Assistant message received (likely continuation)");
      return NextResponse.json(
        formatVapiResponse({
          response: "", // Empty response means continue waiting for user
          endCall: false,
          voiceId: agent.elevenlabs_voice_id,
        })
      );
    }

    // Check if message has no role field - this could be a status/speech update we missed
    // or an acknowledgment message that doesn't need processing
    if (!message?.role && !body.message?.role) {
      console.log("[Vapi] Message without role field received");
      console.log("[Vapi] Message details:", {
        messageType: message?.type || body.message?.type || body.type,
        bodyMessageType: body.message?.type,
        bodyType: body.type,
        hasCall: !!body.call,
        hasMessage: !!body.message,
        bodyKeys: Object.keys(body),
      });
      
      // If it's clearly a status/speech update, acknowledge it
      const messageType = message?.type || body.message?.type || body.type;
      if (messageType === "status-update" || messageType === "speech-update") {
        console.log("[Vapi] Acknowledging status/speech update without role");
        return NextResponse.json({ success: true });
      }
      
      // For any message without role, just acknowledge (don't error)
      // This prevents 400 errors for Vapi events we don't fully handle yet
      console.log("[Vapi] Acknowledging message without role (unknown format)");
      return NextResponse.json({ success: true });
    }

    // Unknown message type WITH a role field (should be rare, log for debugging)
    console.warn("[Vapi] Unknown message role:", message?.role || body.message?.role);
    console.warn("[Vapi] Message type:", message?.type || body.message?.type);
    console.warn("[Vapi] Full message structure:", {
      hasMessage: !!message,
      messageKeys: message ? Object.keys(message) : null,
      messageRole: message?.role,
      messageType: message?.type,
      bodyMessageType: body.message?.type,
      bodyMessageRole: body.message?.role,
      bodyKeys: Object.keys(body),
    });
    
    // Return error only for unknown roles (should be very rare)
    return NextResponse.json(
      { 
        error: "Unknown message type with role",
        details: {
          messageRole: message?.role || body.message?.role,
          messageType: message?.type || body.message?.type,
        }
      },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("[Vapi] Webhook error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


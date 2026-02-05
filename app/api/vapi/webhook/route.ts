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
 * ⚠️ DEPRECATED: Vapi Webhook Handler
 * POST /api/vapi/webhook
 * 
 * This endpoint is NO LONGER USED. We've migrated from Vapi to Twilio Media Streams.
 * 
 * Current voice call flow:
 * - Twilio → /api/twilio/media-stream → Railway WebSocket Server
 * - See /api/twilio/media-stream for the active endpoint
 * 
 * This file is kept for reference only. Vapi is deprecated.
 * 
 * OLD DOCUMENTATION (for reference):
 * This endpoint received webhooks from Vapi for voice calls.
 * Vapi would call this endpoint:
 * 1. When a call starts (with system message)
 * 2. When user speaks (with user message)
 * 3. When assistant needs to respond (with assistant message)
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let body: Record<string, unknown>;
    if (contentType.includes("application/json")) {
      body = await req.json();
    } else {
      // Twilio and others may send form-urlencoded to the wrong URL; avoid crashing
      const text = await req.text();
      try {
        body = JSON.parse(text);
      } catch {
        console.warn("[Vapi] Webhook received non-JSON body (content-type:", contentType, "). Ignoring. If this is Twilio, set Call status changes to https://your-domain.com/api/twilio/status");
        return new NextResponse(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // CRITICAL: Log EVERY incoming message to see what Vapi is actually sending
    console.log("[Vapi] 🔍 WEBHOOK CALLED - Full incoming payload:");
    console.log("[Vapi] Body type:", body.type);
    console.log("[Vapi] Body message type:", body.message?.type);
    console.log("[Vapi] Body message role:", body.message?.role);
    console.log("[Vapi] Body message content:", body.message?.content?.substring(0, 200) || "(no content)");
    console.log("[Vapi] Body keys:", Object.keys(body));
    console.log("[Vapi] Has body.call:", !!body.call, body.call?.id);
    console.log("[Vapi] Has body.message:", !!body.message);
    console.log("[Vapi] Has body.phoneNumber:", !!body.phoneNumber);
    console.log("[Vapi] Full body structure (first 2000 chars):", JSON.stringify(body, null, 2).substring(0, 2000));
    
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
        .select("id, workspace_id, name, elevenlabs_voice_id, llm_instructions")
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

      // When agent has llm_instructions, use default greeting and no scenario
      const useLlmInstructions = !!(agent as { llm_instructions?: string | null }).llm_instructions?.trim();
      let scenarioId: string | null = null;
      let currentStepId: string | null = null;

      if (!useLlmInstructions) {
        const { data: scenarios } = await supabaseAdmin
          .from("scenarios")
          .select("id")
          .eq("agent_id", agent.id)
          .order("created_at", { ascending: true })
          .limit(1);

        scenarioId = scenarios && scenarios.length > 0 ? scenarios[0].id : null;

        console.log("[Vapi] request-start: Scenarios check:", {
          agentId: agent.id,
          scenarioCount: scenarios?.length || 0,
          scenarioId: scenarioId,
        });

        if (scenarioId) {
          const { data: allSteps } = await supabaseAdmin
            .from("steps")
            .select("id, type, sort_order, ai_message, name")
            .eq("scenario_id", scenarioId)
            .order("sort_order", { ascending: true });

          if (allSteps && allSteps.length > 0) {
            const sayStep = allSteps.find((s: { type: string }) => s.type === "say");
            if (sayStep) {
              const greetingIndex = allSteps.findIndex((s: { id: string }) => s.id === sayStep.id);
              if (greetingIndex >= 0 && greetingIndex < allSteps.length - 1) {
                currentStepId = allSteps[greetingIndex + 1].id;
              } else {
                currentStepId = sayStep.id;
              }
            } else {
              currentStepId = allSteps[0].id;
            }
          }
        }
      }

      // Get greeting: default when using llm_instructions, else from Say step
      let greeting = "Hello! How can I help you today?";
      if (!useLlmInstructions && scenarioId) {
        const { data: firstSayStep } = await supabaseAdmin
          .from("steps")
          .select("ai_message, name, type")
          .eq("scenario_id", scenarioId)
          .eq("type", "say")
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (firstSayStep?.ai_message && firstSayStep.ai_message.trim().length > 0) {
          greeting = firstSayStep.ai_message.trim();
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
      console.log("[Vapi] Creating conversation with:", {
        agent_id: agent.id,
        vapiCallId: vapiCallId,
        scenarioId: scenarioId,
        currentStepId: currentStepId,
        hasScenarioId: !!scenarioId,
        hasStepId: !!currentStepId,
      });
      
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
            console.log("[Vapi] Conversation created (background):", {
              conversationId: conversation?.id,
              scenarioId: conversation?.current_scenario_id,
              stepId: conversation?.current_step_id,
              hasScenario: !!conversation?.current_scenario_id,
              hasStep: !!conversation?.current_step_id,
            });
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
      .select("id, workspace_id, name, status, phone_number, elevenlabs_voice_id, is_specialist, parent_agent_id, modality, llm_instructions")
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
              .select("id, workspace_id, name, status, phone_number, elevenlabs_voice_id, is_specialist, parent_agent_id, modality, llm_instructions")
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
                .select("id, workspace_id, name, status, phone_number, elevenlabs_voice_id, is_specialist, parent_agent_id, modality, llm_instructions")
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
      const useLlmSys = !!(agent as { llm_instructions?: string | null }).llm_instructions?.trim();
      let scenarioId: string | null = null;
      let currentStepId: string | null = null;

      if (!useLlmSys) {
        const { data: scenarios } = await supabaseAdmin
          .from("scenarios")
          .select("id, name")
          .eq("agent_id", agent.id)
          .order("created_at", { ascending: true })
          .limit(1);
        scenarioId = scenarios && scenarios.length > 0 ? scenarios[0].id : null;
        if (scenarioId) {
          const { data: allSteps } = await supabaseAdmin
            .from("steps")
            .select("id, type, sort_order, name")
            .eq("scenario_id", scenarioId)
            .order("sort_order", { ascending: true });
          if (allSteps && allSteps.length > 0) {
            const sayStep = allSteps.find((s: { type: string }) => s.type === "say");
            if (sayStep) {
              const greetingIndex = allSteps.findIndex((s: { id: string }) => s.id === sayStep.id);
              currentStepId = greetingIndex >= 0 && greetingIndex < allSteps.length - 1 ? allSteps[greetingIndex + 1].id : sayStep.id;
            } else {
              currentStepId = allSteps[0].id;
            }
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
    // Vapi might send user messages without role field, so check for content instead
    const hasUserContent = (message?.role === "user" && message?.content) || 
                          (message?.content && !message?.role && message?.type !== "status-update" && message?.type !== "speech-update") ||
                          (body.message?.content && body.message?.role === "user") ||
                          (body.message?.content && !body.message?.role && body.message?.type !== "status-update" && body.message?.type !== "speech-update");
    
    if (hasUserContent) {
      const userInput = (message?.content || body.message?.content || "").trim();
      console.log("[Vapi] User message received:", {
        userInput: userInput.substring(0, 100),
        messageRole: message?.role || body.message?.role,
        messageType: message?.type || body.message?.type,
        hasContent: !!userInput,
      });

      // Find conversation by Vapi call ID
      let { data: conversation } = await supabaseAdmin
        .from("conversations")
        .select("*")
        .eq("channel_id", vapiCallId)
        .eq("modality", "voice")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // If no conversation exists (firstMessage was set directly in Vapi),
      // create one now with scenario context
      if (!conversation) {
        console.log("[Vapi] ⚠️  No conversation found - Creating one now (firstMessage was set directly in Vapi)");
        
        // Load scenario to set up conversation context
        const { data: scenarios } = await supabaseAdmin
          .from("scenarios")
          .select("id, name")
          .eq("agent_id", agent.id)
          .order("created_at", { ascending: true })
          .limit(1);

        const scenarioId = scenarios && scenarios.length > 0 ? scenarios[0].id : null;
        let currentStepId: string | null = null;

        // Get first step ID from scenario
        if (scenarioId) {
          const { data: allSteps } = await supabaseAdmin
            .from("steps")
            .select("id, type, sort_order")
            .eq("scenario_id", scenarioId)
            .order("sort_order", { ascending: true })
            .limit(1);

          if (allSteps && allSteps.length > 0) {
            currentStepId = allSteps[0].id;
          }
        }

        // Create conversation
        const { data: newConversation, error: createError } = await supabaseAdmin
          .from("conversations")
          .insert({
            channel_id: vapiCallId,
            agent_id: agent.id,
            workspace_id: agent.workspace_id,
            modality: "voice",
            status: "active",
            current_scenario_id: scenarioId,
            current_step_id: currentStepId,
            metadata: {
              phoneNumber: phoneNumber,
              customerNumber: customerNumber,
              createdAfterFirstMessage: true, // Flag that this was created after first message
            },
          })
          .select()
          .single();

        if (createError || !newConversation) {
          console.error("[Vapi] Failed to create conversation:", createError);
          return NextResponse.json(
            { error: "Failed to create conversation" },
            { status: 500 }
          );
        }

        conversation = newConversation;
        console.log("[Vapi] ✅ Conversation created successfully:", {
          conversationId: conversation.id,
          scenarioId: conversation.current_scenario_id,
          stepId: conversation.current_step_id,
        });
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

      // When agent has llm_instructions, call LLM directly instead of scenario executor
      const agentInstructions = (agent as { llm_instructions?: string | null }).llm_instructions?.trim();
      if (agentInstructions) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          console.error("[Vapi] OPENAI_API_KEY not set, cannot use llm_instructions");
          return NextResponse.json(
            formatVapiResponse({
              response: "I'm sorry, the assistant is not configured. Please try again later.",
              endCall: false,
              voiceId: agent.elevenlabs_voice_id,
            })
          );
        }
        const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
          { role: "system", content: agentInstructions },
          ...transcript.map((m: { role: string; content: string }) => ({ role: m.role as "user" | "assistant", content: m.content })),
        ];
        const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages,
            temperature: 0.3,
            max_tokens: 300,
          }),
        });
        if (!openaiRes.ok) {
          const errText = await openaiRes.text();
          console.error("[Vapi] OpenAI API error:", openaiRes.status, errText);
          return NextResponse.json(
            formatVapiResponse({
              response: "I'm sorry, I had trouble responding. Please try again.",
              endCall: false,
              voiceId: agent.elevenlabs_voice_id,
            })
          );
        }
        const openaiData = await openaiRes.json();
        const assistantContent = openaiData.choices?.[0]?.message?.content?.trim() || "I'm here to help! How can I assist you?";
        const updatedTranscript = [
          ...transcript,
          { role: "assistant", content: assistantContent, timestamp: new Date().toISOString() },
        ];
        await supabaseAdmin
          .from("conversations")
          .update({
            transcript: updatedTranscript,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversation.id);

        return NextResponse.json(
          formatVapiResponse({
            response: assistantContent,
            endCall: false,
            voiceId: agent.elevenlabs_voice_id,
          })
        );
      }

      // Create execution context (scenario-based flow)
      const context: ConversationContext = {
        conversationId: conversation.id,
        agentId: conversation.agent_id,
        scenarioId: conversation.current_scenario_id,
        currentStepId: conversation.current_step_id,
        gatheredData: conversation.gathered_data || {},
        conversationState: conversation.conversation_state || {},
        transcript,
      };

      console.log("[Vapi] Executing agent step with context:", {
        conversationId: context.conversationId,
        agentId: context.agentId,
        scenarioId: context.scenarioId,
        currentStepId: context.currentStepId,
        hasGatheredData: Object.keys(context.gatheredData).length > 0,
        transcriptLength: transcript.length,
      });

      // Execute agent step
      const executor = new AgentExecutor(context);
      const result = await executor.executeNextStep(userInput);
      
      console.log("[Vapi] Agent execution result:", {
        success: result.success,
        hasOutput: !!result.output,
        outputLength: result.output?.length || 0,
        nextStepId: result.nextStepId,
        nextScenarioId: result.nextScenarioId,
        shouldContinue: result.shouldContinue,
        error: result.error,
      });

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
    // CRITICAL: If this is the FIRST message in a call (no conversation exists yet),
    // this might be Vapi asking for the greeting, even if it's not marked as request-start
    if (message?.role === "assistant") {
      console.log("[Vapi] Assistant message received - Checking if this is first message...");
      
      // Check if a conversation already exists for this call
      const { data: existingConversation } = await supabaseAdmin
        .from("conversations")
        .select("id, current_scenario_id, current_step_id")
        .eq("channel_id", vapiCallId)
        .eq("modality", "voice")
        .maybeSingle();
      
      if (!existingConversation) {
        // NO conversation exists = This is the FIRST message in the call!
        console.log("[Vapi] ⚠️  NO CONVERSATION EXISTS - This might be the first greeting request!");
        const useLlmInstructionsFirst = !!(agent as { llm_instructions?: string | null }).llm_instructions?.trim();
        let scenarioIdFirst: string | null = null;
        let currentStepIdFirst: string | null = null;

        if (!useLlmInstructionsFirst) {
          const { data: scenarios } = await supabaseAdmin
            .from("scenarios")
            .select("id, name")
            .eq("agent_id", agent.id)
            .order("created_at", { ascending: true })
            .limit(1);
          scenarioIdFirst = scenarios && scenarios.length > 0 ? scenarios[0].id : null;
          if (scenarioIdFirst) {
            const { data: allSteps } = await supabaseAdmin
              .from("steps")
              .select("id, type, sort_order, ai_message, name")
              .eq("scenario_id", scenarioIdFirst)
              .order("sort_order", { ascending: true });
            if (allSteps && allSteps.length > 0) {
              const sayStep = allSteps.find((s: { type: string }) => s.type === "say");
              if (sayStep) {
                const greetingIndex = allSteps.findIndex((s: { id: string }) => s.id === sayStep.id);
                currentStepIdFirst = greetingIndex >= 0 && greetingIndex < allSteps.length - 1 ? allSteps[greetingIndex + 1].id : sayStep.id;
              } else {
                currentStepIdFirst = allSteps[0].id;
              }
            }
          }
        }

        let greeting = "Hello! How can I help you today?";
        if (!useLlmInstructionsFirst && scenarioIdFirst) {
          const { data: firstSayStep } = await supabaseAdmin
            .from("steps")
            .select("ai_message, name, type")
            .eq("scenario_id", scenarioIdFirst)
            .eq("type", "say")
            .order("sort_order", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (firstSayStep?.ai_message && firstSayStep.ai_message.trim().length > 0) {
            greeting = firstSayStep.ai_message.trim();
          }
        }

        // Create conversation in background
        supabaseAdmin
          .from("conversations")
          .insert({
            channel_id: vapiCallId,
            agent_id: agent.id,
            workspace_id: agent.workspace_id,
            modality: "voice",
            status: "active",
            current_scenario_id: scenarioIdFirst,
            current_step_id: currentStepIdFirst,
            metadata: {
              phoneNumber: phoneNumber,
              customerNumber: customerNumber,
            },
          })
          .select()
          .single()
          .then(({ data: conversation }) => {
            console.log("[Vapi] Conversation created (first message):", {
              conversationId: conversation?.id,
              scenarioId: conversation?.current_scenario_id,
              stepId: conversation?.current_step_id,
            });
          })
          .catch(err => {
            console.error("[Vapi] Conversation creation error (first message):", err);
          });

        // Return greeting immediately
        return NextResponse.json(
          formatVapiResponse({
            response: greeting,
            endCall: false,
            voiceId: agent.elevenlabs_voice_id,
          })
        );
      }
      
      // Conversation already exists = This is a continuation, return empty
      console.log("[Vapi] Assistant message received (continuation - conversation exists)");
      return NextResponse.json(
        formatVapiResponse({
          response: "", // Empty response means continue waiting for user
          endCall: false,
          voiceId: agent.elevenlabs_voice_id,
        })
      );
    }

    // Check if message has content but no role - might be a user message Vapi sent without role
    // Only check this if we haven't already handled it as a user message above
    const hasContentNoRole = (message?.content || body.message?.content) && 
                             !message?.role && !body.message?.role &&
                             message?.type !== "status-update" && 
                             body.message?.type !== "status-update" &&
                             message?.type !== "speech-update" &&
                             body.message?.type !== "speech-update";
    
    if (hasContentNoRole && vapiCallId) {
      const userInput = (message?.content || body.message?.content || "").trim();
      console.log("[Vapi] Message with content but no role - treating as user message:", {
        userInput: userInput.substring(0, 100),
        messageType: message?.type || body.message?.type,
        callId: vapiCallId,
      });
      
      // Try to find conversation and process as user message
      const { data: conversation } = await supabaseAdmin
        .from("conversations")
        .select("*")
        .eq("channel_id", vapiCallId)
        .eq("modality", "voice")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (conversation && userInput) {
        // Process as user message (same logic as above)
        console.log("[Vapi] Found conversation, processing as user message");
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

        // When agent has llm_instructions, call LLM directly
        const agentInstructions2 = (agent as { llm_instructions?: string | null }).llm_instructions?.trim();
        if (agentInstructions2) {
          const apiKey2 = process.env.OPENAI_API_KEY;
          if (apiKey2) {
            const messages2: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
              { role: "system", content: agentInstructions2 },
              ...transcript.map((m: { role: string; content: string }) => ({ role: m.role as "user" | "assistant", content: m.content })),
            ];
            const openaiRes2 = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey2}`, "Content-Type": "application/json" },
              body: JSON.stringify({ model: "gpt-4o-mini", messages: messages2, temperature: 0.3, max_tokens: 300 }),
            });
            if (openaiRes2.ok) {
              const openaiData2 = await openaiRes2.json();
              const assistantContent2 = openaiData2.choices?.[0]?.message?.content?.trim() || "I'm here to help! How can I assist you?";
              const updatedTranscript2 = [...transcript, { role: "assistant", content: assistantContent2, timestamp: new Date().toISOString() }];
              await supabaseAdmin.from("conversations").update({ transcript: updatedTranscript2, updated_at: new Date().toISOString() }).eq("id", conversation.id);
              return NextResponse.json(formatVapiResponse({ response: assistantContent2, endCall: false, voiceId: agent.elevenlabs_voice_id }));
            }
          }
        }

        // Create execution context (scenario-based flow)
        const context: ConversationContext = {
          conversationId: conversation.id,
          agentId: conversation.agent_id,
          scenarioId: conversation.current_scenario_id,
          currentStepId: conversation.current_step_id,
          gatheredData: conversation.gathered_data || {},
          conversationState: conversation.conversation_state || {},
          transcript,
        };

        console.log("[Vapi] Executing agent step with context:", {
          conversationId: context.conversationId,
          agentId: context.agentId,
          scenarioId: context.scenarioId,
          currentStepId: context.currentStepId,
          hasGatheredData: Object.keys(context.gatheredData).length > 0,
          transcriptLength: transcript.length,
        });

        // Execute agent step
        const executor = new AgentExecutor(context);
        const result = await executor.executeNextStep(userInput);
        
        console.log("[Vapi] Agent execution result:", {
          success: result.success,
          hasOutput: !!result.output,
          outputLength: result.output?.length || 0,
          nextStepId: result.nextStepId,
          nextScenarioId: result.nextScenarioId,
          shouldContinue: result.shouldContinue,
          error: result.error,
        });

        if (result.success && result.output) {
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

          // Return response to Vapi
          return NextResponse.json(
            formatVapiResponse({
              response: result.output,
              endCall: !result.shouldContinue,
              voiceId: agent.elevenlabs_voice_id,
            })
          );
        }
      } else if (!conversation) {
        console.warn("[Vapi] Message with content but no conversation found, might be before request-start");
        // If no conversation yet, this might be before request-start - acknowledge and wait
        return NextResponse.json({ success: true });
      }
    }

    // Check if message has no role field and no content - just an acknowledgment/status message
    if (!message?.role && !body.message?.role && !hasContentNoRole) {
      console.log("[Vapi] Message without role field received");
      console.log("[Vapi] Message details:", {
        messageType: message?.type || body.message?.type || body.type,
        bodyMessageType: body.message?.type,
        bodyType: body.type,
        hasCall: !!body.call,
        hasMessage: !!body.message,
        hasContent: !!(message?.content || body.message?.content),
        bodyKeys: Object.keys(body),
      });
      
      // If it's clearly a status/speech update, acknowledge it
      const messageType = message?.type || body.message?.type || body.type;
      if (messageType === "status-update" || messageType === "speech-update") {
        console.log("[Vapi] Acknowledging status/speech update without role");
        return NextResponse.json({ success: true });
      }
      
      // For any message without role and no content, check if this is actually a call start request
      // Vapi might send a message without role/content at call start to request the greeting
      console.log("[Vapi] 🔍 Message without role (no content) - DETAILED DEBUG...");
      
      // Extract ALL possible call identifiers
      const vapiCallId = body.call?.id || body.message?.call?.id || body.callId || body.call_id;
      const phoneNumber = body.phoneNumber?.number || body.call?.phoneNumber || body.phoneNumberId || body.message?.phoneNumber?.number;
      const customerNumber = body.customer?.number || body.call?.customer?.number || body.customerNumber;
      const assistantId = body.assistant?.id || body.assistantId || body.message?.assistant?.id;
      
      console.log("[Vapi] 🔍 Extracted identifiers:", {
        vapiCallId: vapiCallId,
        phoneNumber: phoneNumber,
        customerNumber: customerNumber,
        assistantId: assistantId,
        hasCall: !!body.call,
        hasPhoneNumber: !!body.phoneNumber,
        hasAssistant: !!body.assistant,
        hasMessage: !!body.message,
        messageType: body.message?.type,
        bodyType: body.type,
        bodyKeys: Object.keys(body),
        messageKeys: body.message ? Object.keys(body.message) : null,
        // FULL BODY for debugging (truncated)
        fullBodyStructure: JSON.stringify(body, null, 2).substring(0, 2000),
      });
      
      // Check if this is the start of a call (has call ID but no conversation exists)
      if (vapiCallId) {
        console.log("[Vapi] 🔍 Has call ID, checking if conversation exists...");
        
        // Check if conversation already exists
        const { data: existingConversation } = await supabaseAdmin
          .from("conversations")
          .select("id, created_at")
          .eq("channel_id", vapiCallId)
          .eq("modality", "voice")
          .maybeSingle();
        
        console.log("[Vapi] 🔍 Conversation check result:", {
          callId: vapiCallId,
          conversationExists: !!existingConversation,
          conversationId: existingConversation?.id || null,
          conversationCreated: existingConversation?.created_at || null,
        });
        
        if (!existingConversation) {
          // NO conversation exists + has call ID = This might be the greeting request!
          console.log("[Vapi] ⚠️  NO CONVERSATION EXISTS for call ID - This might be the first greeting request!");
          
          // Try to find agent by phone number (if we have it)
          if (phoneNumber) {
            const normalizedPhone = normalizePhone(phoneNumber);
            
            if (normalizedPhone) {
              const possibleFormats = [
                normalizedPhone,
                phoneNumber,
                normalizedPhone?.replace(/^\+1/, ""),
                phoneNumber?.replace(/^\+1/, ""),
              ].filter(Boolean) as string[];
              const uniqueFormats = [...new Set(possibleFormats)];
              
              console.log("[Vapi] 🔍 Looking for agent with phone formats:", uniqueFormats);
              
              // Find agent
              const { data: agent } = await supabaseAdmin
                .from("agents")
                .select("id, workspace_id, name, elevenlabs_voice_id, phone_number, llm_instructions")
                .in("phone_number", uniqueFormats)
                .in("modality", ["voice", "multi-modal"])
                .eq("status", "deployed")
                .limit(1)
                .maybeSingle();
              
              console.log("[Vapi] 🔍 Agent lookup result:", {
                found: !!agent,
                agentId: agent?.id || null,
                agentName: agent?.name || null,
                agentPhoneNumber: agent?.phone_number || null,
              });
              
              if (agent) {
                const useLlmInstr = !!(agent as { llm_instructions?: string | null }).llm_instructions?.trim();
                let scenarioIdLate: string | null = null;
                let currentStepIdLate: string | null = null;
                let greeting = "Hello! How can I help you today?";

                if (!useLlmInstr) {
                  const { data: scenarios } = await supabaseAdmin
                    .from("scenarios")
                    .select("id, name")
                    .eq("agent_id", agent.id)
                    .order("created_at", { ascending: true })
                    .limit(1);
                  scenarioIdLate = scenarios && scenarios.length > 0 ? scenarios[0].id : null;
                  if (scenarioIdLate) {
                    const { data: firstSayStep } = await supabaseAdmin
                      .from("steps")
                      .select("ai_message, name, type")
                      .eq("scenario_id", scenarioIdLate)
                      .eq("type", "say")
                      .order("sort_order", { ascending: true })
                      .limit(1)
                      .maybeSingle();
                    if (firstSayStep?.ai_message && firstSayStep.ai_message.trim().length > 0) {
                      greeting = firstSayStep.ai_message.trim();
                    }
                    const { data: allSteps } = await supabaseAdmin
                      .from("steps")
                      .select("id, type, sort_order")
                      .eq("scenario_id", scenarioIdLate)
                      .order("sort_order", { ascending: true });
                    if (allSteps && allSteps.length > 0) {
                      const sayStep = allSteps.find((s: { type: string }) => s.type === "say");
                      if (sayStep) {
                        const greetingIndex = allSteps.findIndex((s: { id: string }) => s.id === sayStep.id);
                        currentStepIdLate = greetingIndex >= 0 && greetingIndex < allSteps.length - 1 ? allSteps[greetingIndex + 1].id : sayStep.id;
                      } else {
                        currentStepIdLate = allSteps[0].id;
                      }
                    }
                  }
                }

                supabaseAdmin
                  .from("conversations")
                  .insert({
                    channel_id: vapiCallId,
                    agent_id: agent.id,
                    workspace_id: agent.workspace_id,
                    modality: "voice",
                    status: "active",
                    current_scenario_id: scenarioIdLate,
                    current_step_id: currentStepIdLate,
                    metadata: {
                      phoneNumber: phoneNumber,
                      customerNumber: customerNumber,
                    },
                  })
                  .then(() => {
                    console.log("[Vapi] ✅ Conversation created (first greeting request)");
                  })
                  .catch(err => {
                    console.error("[Vapi] ❌ Failed to create conversation:", err);
                  });

                // Return greeting immediately (DON'T WAIT for conversation creation)
                // CRITICAL: Make it EXPLICIT that this is the greeting response
                const greetingResponse = formatVapiResponse({
                  response: greeting,
                  endCall: false,
                  voiceId: agent.elevenlabs_voice_id,
                });
                
                console.log("[Vapi] ✅✅✅ EXPLICITLY RETURNING GREETING FROM SCENARIO:");
                console.log("[Vapi] Greeting text:", greeting);
                console.log("[Vapi] Full response being sent to Vapi:", JSON.stringify(greetingResponse, null, 2));
                
                // Return with explicit headers and format
                return NextResponse.json(greetingResponse, {
                  status: 200,
                  headers: {
                    'Content-Type': 'application/json',
                  },
                });
              } else {
                console.warn("[Vapi] ❌ Could not find agent for phone number:", phoneNumber);
              }
            } else {
              console.warn("[Vapi] ❌ Could not normalize phone number:", phoneNumber);
            }
          } else {
            console.warn("[Vapi] ❌ No phone number found in message - Cannot find agent");
          }
        } else {
          console.log("[Vapi] ℹ️  Conversation already exists - This is not the first message");
        }
      } else {
        console.warn("[Vapi] ❌ No call ID found in message - Cannot determine if this is call start");
      }
      
      // Not a call start request, just acknowledge
      console.log("[Vapi] ℹ️  Acknowledging message without role (no content) - Not identified as call start");
      return NextResponse.json({ success: true });
    }

    // Unknown message type WITH a role field (should be rare, log for debugging)
    console.warn("[Vapi] ⚠️  UNHANDLED MESSAGE - Full structure:", {
      hasMessage: !!message,
      messageKeys: message ? Object.keys(message) : null,
      messageRole: message?.role || body.message?.role,
      messageType: message?.type || body.message?.type,
      bodyMessageType: body.message?.type,
      bodyMessageRole: body.message?.role,
      bodyType: body.type,
      bodyKeys: Object.keys(body),
      hasCall: !!body.call,
      callId: body.call?.id,
      hasPhoneNumber: !!body.phoneNumber,
      phoneNumber: body.phoneNumber?.number,
      fullBody: JSON.stringify(body, null, 2).substring(0, 3000),
    });
    
    // CRITICAL: If this is a user message we missed, try to handle it
    // Check if it has content that looks like user input
    const potentialUserInput = message?.content || body.message?.content || body.content;
    if (potentialUserInput && potentialUserInput.trim().length > 0 && 
        (message?.role === "user" || body.message?.role === "user" || 
         !message?.role && !body.message?.role)) {
      console.log("[Vapi] ⚠️  DETECTED USER MESSAGE IN UNHANDLED CASE - Processing as user message");
      
      // Try to find conversation and process as user message
      const callId = body.call?.id || body.message?.call?.id || body.callId;
      if (callId) {
        const { data: conversation } = await supabaseAdmin
          .from("conversations")
          .select("*")
          .eq("channel_id", callId)
          .eq("modality", "voice")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (conversation && agent) {
          const userInput = potentialUserInput.trim();
          console.log("[Vapi] ✅ Found conversation, processing unhandled user message:", userInput.substring(0, 100));
          
          // Process as user message (same logic as above)
          const transcript = conversation.transcript || [];
          transcript.push({
            role: "user",
            content: userInput,
            timestamp: new Date().toISOString(),
          });

          await supabaseAdmin.from("conversations").update({ transcript }).eq("id", conversation.id);

          const agentInstructions3 = (agent as { llm_instructions?: string | null }).llm_instructions?.trim();
          if (agentInstructions3) {
            const apiKey3 = process.env.OPENAI_API_KEY;
            if (apiKey3) {
              const messages3: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
                { role: "system", content: agentInstructions3 },
                ...transcript.map((m: { role: string; content: string }) => ({ role: m.role as "user" | "assistant", content: m.content })),
              ];
              const openaiRes3 = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${apiKey3}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: "gpt-4o-mini", messages: messages3, temperature: 0.3, max_tokens: 300 }),
              });
              if (openaiRes3.ok) {
                const openaiData3 = await openaiRes3.json();
                const assistantContent3 = openaiData3.choices?.[0]?.message?.content?.trim() || "I'm here to help! How can I assist you?";
                const updatedTranscript3 = [...transcript, { role: "assistant", content: assistantContent3, timestamp: new Date().toISOString() }];
                await supabaseAdmin.from("conversations").update({ transcript: updatedTranscript3, updated_at: new Date().toISOString() }).eq("id", conversation.id);
                return NextResponse.json(formatVapiResponse({ response: assistantContent3, endCall: false, voiceId: agent.elevenlabs_voice_id }));
              }
            }
          }

          const context: ConversationContext = {
            conversationId: conversation.id,
            agentId: conversation.agent_id,
            scenarioId: conversation.current_scenario_id,
            currentStepId: conversation.current_step_id,
            gatheredData: conversation.gathered_data || {},
            conversationState: conversation.conversation_state || {},
            transcript,
          };

          const executor = new AgentExecutor(context);
          const result = await executor.executeNextStep(userInput);
          
          await supabaseAdmin
            .from("conversations")
            .update({
              transcript: [
                ...transcript,
                { role: "assistant", content: result.output || "", timestamp: new Date().toISOString() },
              ],
              current_step_id: result.nextStepId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", conversation.id);

          return NextResponse.json(
            formatVapiResponse({
              response: result.output || "I'm here to help! How can I assist you?",
              endCall: !result.shouldContinue,
              voiceId: agent.elevenlabs_voice_id,
            })
          );
        }
      }
    }
    
    // Return error only for truly unknown roles
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


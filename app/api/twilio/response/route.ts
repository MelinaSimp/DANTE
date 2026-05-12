import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AgentExecutor, ConversationContext } from "@/lib/agent-executor/executor";
import { xmlEscape, xmlEscapeAttr } from "@/lib/xml";
import { generateSpeechTwiml } from "@/lib/elevenlabs/twiml";
import { validateTwilioRequest } from "@/lib/twilio-validate";
import { isHumanTransferRequest } from "@/lib/voice/transfer-intent";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const DEBUG = process.env.DEBUG_VOICE === "true";

/**
 * Twilio Response Handler (Optimized)
 * POST /api/twilio/response
 * 
 * This endpoint handles user speech responses during a call.
 * Called automatically by Twilio's <Gather> action.
 * 
 * Optimized for low latency with parallel processing and caching.
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await validateTwilioRequest(req))) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const missing: string[] = [];
    if (!process.env.OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
    if (!process.env.ELEVENLABS_API_KEY) missing.push("ELEVENLABS_API_KEY");
    if (missing.length > 0) {
      console.error(`[Twilio Response] Missing env vars: ${missing.join(", ")}`);
      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>We are experiencing technical difficulties. Please try again later.</Say><Hangup/></Response>`;
      return new NextResponse(twiml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
    }

    const formData = await req.formData();
    const callSid = (req.nextUrl.searchParams.get("callSid") || formData.get("CallSid") || "").toString();
    const conversationId = req.nextUrl.searchParams.get("conversationId") || "";
    const speechResult = (formData.get("SpeechResult") || "").toString().trim();
    const from = formData.get("From")?.toString() || "";
    const to = formData.get("To")?.toString() || "";

    if (DEBUG) console.log("[Twilio] Response:", { callSid, conversationId, speechResult: speechResult?.substring(0, 50), from, to });

    if (!conversationId) {
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Call session missing.</Say>
  <Hangup/>
</Response>`;
      return new NextResponse(errorTwiml, {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

        // Get base URL - ALWAYS use current deployment (VERCEL_URL or request host)
        // Priority: 1) VERCEL_URL (current deployment), 2) Request headers, 3) Environment vars
        let baseUrl = "";
        
        // FIRST: Use VERCEL_URL (this is the CURRENT deployment, always up-to-date)
        if (process.env.VERCEL_URL) {
          const vercelUrl = process.env.VERCEL_URL;
          baseUrl = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
          if (DEBUG) console.log("[Twilio Response] Using VERCEL_URL (current deployment):", baseUrl);
        }
        
        // SECOND: Construct from request headers (also current deployment)
        if (!baseUrl) {
          const protocol = req.headers.get("x-forwarded-proto") || "https";
          const host = req.headers.get("host") || req.headers.get("x-forwarded-host") || req.nextUrl.host;
          if (host) {
            baseUrl = `${protocol}://${host}`;
            if (DEBUG) console.log("[Twilio Response] Using request host (current deployment):", baseUrl);
          }
        }
        
        // THIRD: Fallback to environment variables (might be outdated)
        if (!baseUrl) {
          baseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "";
          if (baseUrl) {
            console.warn("[Twilio Response] Using environment variable (might be outdated):", baseUrl);
          }
        }
        
        // Remove trailing slashes and any whitespace/newlines
        baseUrl = baseUrl.replace(/\/+$/, "").trim().replace(/\s+/g, "");
        
        if (DEBUG) console.log("[Twilio Response] Final base URL:", baseUrl);

    // OPTIMIZATION: Load conversation first, then load agent in parallel with other operations
    const { data: conversation } = await supabaseAdmin
      .from("conversations")
      .select("*, transfer_history, transferred_to_agent_id, transferred_from_agent_id")
      .eq("id", conversationId)
      .single();

    // Load agent to get voice configuration
    let agentVoiceId: string | null = null;
    let humanFallbackNumber: string | null = null;
    if (conversation?.agent_id) {
      const { data: agent } = await supabaseAdmin
        .from("agents")
        .select("elevenlabs_voice_id, human_fallback_number")
        .eq("id", conversation.agent_id)
        .single();
      agentVoiceId = agent?.elevenlabs_voice_id || null;
      humanFallbackNumber = agent?.human_fallback_number || null;
    }

    if (!conversation) {
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Conversation not found.</Say>
  <Hangup/>
</Response>`;
      return new NextResponse(errorTwiml, {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    // Check if this is a timeout (no speech after waiting)
    // When Gather times out, Twilio redirects to action URL with empty SpeechResult
    // We'll track consecutive empty responses in conversation state
    if (!speechResult) {
      // Use already-loaded conversation data (no duplicate query needed)
      const currentTranscript = conversation?.transcript || [];
      const conversationState = conversation?.conversation_state || {};
      const hasAssistantMessages = currentTranscript.some((msg: any) => msg.role === "assistant");

      // Track consecutive empty responses
      const emptyResponseCount = (conversationState.emptyResponseCount || 0) + 1;
      
      // If we've had a conversation and have 2+ consecutive empty responses, treat as timeout
      if (hasAssistantMessages && emptyResponseCount >= 2) {
        const timeoutMessage = "It seems as if you no longer have any more questions, I will cut the call now.";
        
        if (DEBUG) console.log("[Twilio Response] Timeout:", { agentVoiceId, baseUrl });
        
        const speechTwiml = await generateSpeechTwiml(timeoutMessage, agentVoiceId, baseUrl);
        if (DEBUG) console.log("[Twilio Response] Timeout speech TwiML:", speechTwiml);
        
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speechTwiml}
  <Hangup/>
</Response>`;
        
        if (DEBUG) console.log("[Twilio Response] Timeout final TwiML:", twiml);
        
        // Update conversation status
        await supabaseAdmin
          .from("conversations")
          .update({ 
            status: "completed",
            conversation_state: { ...conversationState, emptyResponseCount: 0 }
          })
          .eq("id", conversationId);

        return new NextResponse(twiml, {
          status: 200,
          headers: { "Content-Type": "text/xml; charset=utf-8" },
        });
      }

      // Update empty response count for next check
      await supabaseAdmin
        .from("conversations")
        .update({ 
          conversation_state: { ...conversationState, emptyResponseCount }
        })
        .eq("id", conversationId);
    }

    // If no speech result, check if we need to execute a "Say" step (greeting after transfer)
    if (!speechResult) {
      if (!conversationId) {
        console.error("[Twilio Response] Conversation ID is missing");
        const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Configuration error. Please contact support.</Say>
  <Hangup/>
</Response>`;
        return new NextResponse(errorTwiml, {
          status: 200,
          headers: { "Content-Type": "text/xml; charset=utf-8" },
        });
      }
      
      // Check if current step is a "Say" step that needs to be executed (greeting after transfer)
      if (conversation.current_step_id && conversation.current_scenario_id) {
        const { data: currentStep } = await supabaseAdmin
          .from("steps")
          .select("id, type, ai_message")
          .eq("id", conversation.current_step_id)
          .single();
        
        if (currentStep && currentStep.type === "say" && currentStep.ai_message) {
          // Execute the Say step automatically
          const sayContext: ConversationContext = {
            conversationId: conversation.id,
            agentId: conversation.agent_id,
            scenarioId: conversation.current_scenario_id,
            currentStepId: currentStep.id,
            gatheredData: conversation.gathered_data || {},
            conversationState: conversation.conversation_state || {},
            transcript: conversation.transcript || [],
          };
          
          const sayExecutor = new AgentExecutor(sayContext);
          const sayResult = await sayExecutor.executeNextStep(""); // Empty input triggers Say step
          
          if (sayResult.success && sayResult.output) {
            // Get the next step
            const { data: allSteps } = await supabaseAdmin
              .from("steps")
              .select("id, sort_order")
              .eq("scenario_id", conversation.current_scenario_id)
              .order("sort_order", { ascending: true });
            
            let nextStepId = currentStep.id;
            if (allSteps && allSteps.length > 0) {
              const currentIndex = allSteps.findIndex(s => s.id === currentStep.id);
              if (currentIndex >= 0 && currentIndex < allSteps.length - 1) {
                nextStepId = allSteps[currentIndex + 1].id;
              }
            }
            
            // Update conversation to move past the Say step
            await supabaseAdmin
              .from("conversations")
              .update({ current_step_id: nextStepId })
              .eq("id", conversationId);
            
            // Generate speech for the greeting
            const speechTwiml = await generateSpeechTwiml(sayResult.output, agentVoiceId, baseUrl);
            
            // Ensure baseUrl doesn't have trailing slash and is clean
            const cleanBaseUrl = baseUrl.trim().replace(/\/+$/, "").replace(/\s+/g, "");
            const responseUrl = `${cleanBaseUrl}/api/twilio/response?callSid=${encodeURIComponent(callSid)}&conversationId=${encodeURIComponent(conversationId)}`;
            const escapedResponseUrl = xmlEscapeAttr(responseUrl.trim().replace(/\s+/g, ""));
            const partialCallbackUrl = `${cleanBaseUrl}/api/twilio/partial?conversationId=${conversationId}`;
            const escapedPartialCallback = xmlEscapeAttr(partialCallbackUrl);
            
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speechTwiml}
  <Pause length="1"/>
  <Gather input="speech" method="POST" speechTimeout="auto" language="en-US" action="${escapedResponseUrl}" partialResultCallback="${escapedPartialCallback}" partialResultCallbackMethod="POST">
  </Gather>
  <Redirect>${escapedResponseUrl}</Redirect>
</Response>`;
            return new NextResponse(twiml, {
              status: 200,
              headers: { "Content-Type": "text/xml" },
            });
          }
        }
      }
      
      // No Say step to execute, just set up Gather
      // Ensure baseUrl doesn't have trailing slash and is clean
      const cleanBaseUrl = baseUrl.trim().replace(/\/+$/, "").replace(/\s+/g, "");
      const actionUrl = `${cleanBaseUrl}/api/twilio/response?callSid=${encodeURIComponent(callSid)}&conversationId=${encodeURIComponent(conversationId)}`;
      
      if (DEBUG) console.log("[Twilio Response] Constructed action URL:", actionUrl);
      if (DEBUG) console.log("[Twilio Response] Action URL JSON:", JSON.stringify(actionUrl));
      
      // Validate URL before using
      try {
        const testUrl = new URL(actionUrl);
        if (DEBUG) console.log("[Twilio Response] URL validation passed:", testUrl.href);
      } catch (error) {
        console.error("[Twilio Response] Invalid action URL constructed:", actionUrl);
        console.error("[Twilio Response] URL validation error:", error);
        const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Configuration error. Please contact support.</Say>
  <Hangup/>
</Response>`;
        return new NextResponse(errorTwiml, {
          status: 200,
          headers: { "Content-Type": "text/xml; charset=utf-8" },
        });
      }
      
      // Clean the URL one more time before escaping (remove any whitespace/newlines)
      const cleanActionUrl = actionUrl.trim().replace(/\s+/g, "").replace(/\n/g, "").replace(/\r/g, "");
      const escapedAction = xmlEscapeAttr(cleanActionUrl);
      if (DEBUG) console.log("[Twilio Response] Clean action URL:", cleanActionUrl);
      if (DEBUG) console.log("[Twilio Response] Escaped action URL:", escapedAction);
      // Add partial result callback for interruptability
      const partialCallbackUrl = `${baseUrl}/api/twilio/partial?conversationId=${conversationId}`;
      const escapedPartialCallback = xmlEscapeAttr(partialCallbackUrl);
      
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" method="POST" speechTimeout="auto" language="en-US" action="${escapedAction}" partialResultCallback="${escapedPartialCallback}" partialResultCallbackMethod="POST">
  </Gather>
  <Redirect>${escapedAction}</Redirect>
</Response>`;
      return new NextResponse(twiml, {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Add user message to transcript
    const transcript = conversation.transcript || [];
    transcript.push({
      role: "user",
      content: speechResult,
      timestamp: new Date().toISOString(),
    });

    // ───────────────────────────────────────────────────────────────
    // Warm transfer to a human.
    //
    // If the caller clearly asked for a person AND the agent has a
    // fallback number configured, cut out of the LLM loop here and
    // bridge the call. Twilio <Dial> is a terminal TwiML verb — after
    // this point the call is the receptionist's. We mark the
    // conversation "completed" so Drift's UI doesn't think it's still
    // running, and we annotate the transcript so the summary knows
    // why we handed off.
    //
    // If the intent fires but no fallback is configured, we just fall
    // through to the normal executor — better to keep trying to help
    // than to tell the caller "sorry, nobody's here."
    // ───────────────────────────────────────────────────────────────
    if (humanFallbackNumber && isHumanTransferRequest(speechResult)) {
      const fallback = normalizePhone(humanFallbackNumber) || humanFallbackNumber;
      if (DEBUG)
        console.log("[Twilio Response] Human-transfer intent matched. Dialing:", fallback);

      const handoffMessage = "One moment — connecting you now.";
      const handoffSpeech = await generateSpeechTwiml(
        handoffMessage,
        agentVoiceId,
        baseUrl,
      );

      transcript.push({
        role: "assistant",
        content: handoffMessage,
        timestamp: new Date().toISOString(),
      });
      transcript.push({
        role: "system",
        content: `Caller asked for a human; transferred to ${fallback}.`,
        timestamp: new Date().toISOString(),
      });

      try {
        await supabaseAdmin
          .from("conversations")
          .update({
            transcript,
            status: "completed",
            conversation_state: {
              ...(conversation.conversation_state || {}),
              transferredToHuman: true,
              transferredAt: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId);
      } catch (err) {
        console.error("[Twilio Response] Failed to mark conversation transferred:", err);
      }

      // Use the Twilio-owned destination number as callerId so the
      // receptionist's phone always accepts the call (arbitrary
      // pass-through caller IDs get blocked). The original caller's
      // number is still visible in Twilio's call log.
      const callerId = xmlEscapeAttr(to || "");
      const dialNumber = xmlEscape(fallback);
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${handoffSpeech}
  <Dial timeout="25"${callerId ? ` callerId="${callerId}"` : ""}>
    <Number>${dialNumber}</Number>
  </Dial>
  <Say>We weren't able to reach anyone. Please try again later.</Say>
  <Hangup/>
</Response>`;

      return new NextResponse(twiml, {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    // Reset empty response count since we got a valid response
    const conversationState = conversation.conversation_state || {};
    await supabaseAdmin
      .from("conversations")
      .update({ 
        transcript,
        conversation_state: { ...conversationState, emptyResponseCount: 0 }
      })
      .eq("id", conversationId);

    // Check if current step is a "Say" step that needs to be spoken first
    // This handles both initial greetings and post-transfer greetings
    let greetingOutput = "";
    let stepIdForUserInput = conversation.current_step_id;
    
    if (conversation.current_step_id && conversation.current_scenario_id) {
      // Check what the current step is
      const { data: currentStep } = await supabaseAdmin
        .from("steps")
        .select("id, type, ai_message, name, sort_order")
        .eq("id", conversation.current_step_id)
        .single();
      
      // If current step is a "Say" step, execute it first to get the greeting
      if (currentStep && currentStep.type === "say") {
        // Execute the Say step first (with empty input to trigger it)
        const greetingContext: ConversationContext = {
          conversationId: conversation.id,
          agentId: conversation.agent_id,
          scenarioId: conversation.current_scenario_id,
          currentStepId: currentStep.id,
          gatheredData: conversation.gathered_data || {},
          conversationState: conversation.conversation_state || {},
          transcript,
        };
        
        const greetingExecutor = new AgentExecutor(greetingContext);
        const greetingResult = await greetingExecutor.executeNextStep(""); // Empty input triggers Say step
        
        if (greetingResult.success && greetingResult.output) {
          greetingOutput = greetingResult.output;
          
          // Get the next step for processing user input
          const { data: allSteps } = await supabaseAdmin
            .from("steps")
            .select("id, type, sort_order")
            .eq("scenario_id", conversation.current_scenario_id)
            .order("sort_order", { ascending: true });
          
          if (allSteps && allSteps.length > 0) {
            const currentIndex = allSteps.findIndex(s => s.id === currentStep.id);
            if (currentIndex >= 0 && currentIndex < allSteps.length - 1) {
              stepIdForUserInput = allSteps[currentIndex + 1].id;
            }
          }
        }
      }
    }
    
    // Create execution context for processing user input
    const context: ConversationContext = {
      conversationId: conversation.id,
      agentId: conversation.agent_id,
      scenarioId: conversation.current_scenario_id,
      currentStepId: stepIdForUserInput, // Use next step for processing user input
      gatheredData: conversation.gathered_data || {},
      conversationState: conversation.conversation_state || {},
      transcript,
    };

    // Execute agent step (process user input)
    const executor = new AgentExecutor(context);
    const result = await executor.executeNextStep(speechResult);
    
    // Check if a transfer just happened - if so, we need to say the greeting immediately
    if (result.transferToAgentId && result.transferToAgentId !== conversation.agent_id) {
      // Transfer happened - get the greeting from the new agent
      const { data: newAgentScenario } = await supabaseAdmin
        .from("scenarios")
        .select("id")
        .eq("agent_id", result.transferToAgentId)
        .order("created_at", { ascending: true })
        .limit(1);
      
      if (newAgentScenario && newAgentScenario.length > 0) {
        const { data: newSteps } = await supabaseAdmin
          .from("steps")
          .select("id, type, ai_message")
          .eq("scenario_id", newAgentScenario[0].id)
          .order("sort_order", { ascending: true });
        
        const firstSayStep = newSteps?.find(s => s.type === "say");
        if (firstSayStep && firstSayStep.ai_message) {
          // Prepend the greeting to the transfer message
          result.output = `${result.output || ""} ${firstSayStep.ai_message}`.trim();
        }
      }
    }
    
    // If we have a greeting (from checking current step), prepend it to the result
    if (greetingOutput) {
      if (result.output) {
        result.output = `${greetingOutput} ${result.output}`.trim();
      } else {
        // If no result output but we have greeting, use greeting
        result.output = greetingOutput;
      }
    }

    if (!result.success) {
      const errorMessage = "I'm sorry, I encountered an error. Please try again.";
      if (DEBUG) console.log("[Twilio Response] Generating error speech...");
      if (DEBUG) console.log("[Twilio Response] Error message:", errorMessage);
      if (DEBUG) console.log("[Twilio Response] Agent voice ID:", agentVoiceId);
      if (DEBUG) console.log("[Twilio Response] Base URL:", baseUrl);
      
      const speechTwiml = await generateSpeechTwiml(errorMessage, agentVoiceId, baseUrl);
      if (DEBUG) console.log("[Twilio Response] Error speech TwiML:", speechTwiml);
      
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speechTwiml}
  <Hangup/>
</Response>`;
      
      if (DEBUG) console.log("[Twilio Response] Error final TwiML:", errorTwiml);
      return new NextResponse(errorTwiml, {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    // OPTIMIZATION: Prepare database updates and URL construction in parallel with TTS generation
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

    // Handle scenario switching
    if (result.nextScenarioId) {
      updates.current_scenario_id = result.nextScenarioId;
      
      // Get the first step of the new scenario
      const { data: firstStep } = await supabaseAdmin
        .from("steps")
        .select("id")
        .eq("scenario_id", result.nextScenarioId)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      
      if (firstStep) {
        updates.current_step_id = firstStep.id;
      }
    } else if (result.nextStepId !== undefined) {
      updates.current_step_id = result.nextStepId;
    }

    if (result.gatheredData) {
      updates.gathered_data = result.gatheredData;
    }

    if (!result.shouldContinue) {
      updates.status = "completed";
    }

    // Prepare URL construction (doesn't need to wait)
    const cleanBaseUrl = baseUrl.trim().replace(/\/+$/, "").replace(/\s+/g, "");
    const responseUrl = `${cleanBaseUrl}/api/twilio/response?callSid=${encodeURIComponent(callSid)}&conversationId=${encodeURIComponent(conversationId)}`;
    const cleanResponseUrl = responseUrl.trim().replace(/\s+/g, "").replace(/\n/g, "").replace(/\r/g, "");
    const escapedResponseUrl = xmlEscapeAttr(cleanResponseUrl);
    const partialCallbackUrl = `${cleanBaseUrl}/api/twilio/partial?conversationId=${encodeURIComponent(conversationId)}`;
    const escapedPartialCallback = xmlEscapeAttr(partialCallbackUrl);

    // OPTIMIZATION: Run database update and TTS generation in parallel
    const hasOutput = result.output && result.output.trim().length > 0;
    
    if (DEBUG) console.log("[Twilio Response] Starting parallel operations (DB update + TTS)...");
    const parallelStartTime = Date.now();
    
    const [_, speechTwiml] = await Promise.all([
      // Database update (fire and forget - don't block on it)
      (async () => {
        try {
          await supabaseAdmin.from("conversations").update(updates).eq("id", conversationId);
          if (DEBUG) console.log(`[Twilio Response] DB update done in ${Date.now() - parallelStartTime}ms`);
        } catch (err: any) {
          console.error("[Twilio Response] Database update error (non-blocking):", err);
        }
      })(),
      // TTS generation (this is what we're waiting for)
      hasOutput
        ? generateSpeechTwiml(result.output!, agentVoiceId, baseUrl)
        : Promise.resolve("")
    ]);
    
    const parallelTime = Date.now() - parallelStartTime;
    if (DEBUG) console.log(`[Twilio Response] Parallel operations (DB + TTS) completed in ${parallelTime}ms`);

    // Validate URL before using
    if (!conversationId) {
      console.error("[Twilio Response] Conversation ID is missing for response URL");
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Configuration error. Please contact support.</Say>
  <Hangup/>
</Response>`;
      return new NextResponse(errorTwiml, {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }
    
    try {
      const testUrl = new URL(responseUrl);
      if (DEBUG) console.log("[Twilio Response] URL validation passed:", testUrl.href);
    } catch (error) {
      console.error("[Twilio Response] Invalid response URL constructed:", responseUrl);
      console.error("[Twilio Response] URL validation error:", error);
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Configuration error. Please contact support.</Say>
  <Hangup/>
</Response>`;
      return new NextResponse(errorTwiml, {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }
    
    if (DEBUG) console.log("[Twilio Response] Clean response URL:", cleanResponseUrl);
    if (DEBUG) console.log("[Twilio Response] Escaped response URL:", escapedResponseUrl);
    if (DEBUG) console.log("[Twilio Response] Partial callback URL:", partialCallbackUrl);

    if (!result.shouldContinue) {
      // End conversation - only say something if there's configured output
      if (DEBUG) console.log("[Twilio Response] Ending conversation...");
      if (DEBUG) console.log("[Twilio Response] Has output:", hasOutput);
      if (DEBUG) console.log("[Twilio Response] Output text:", result.output?.substring(0, 100));
      if (DEBUG) console.log("[Twilio Response] Speech TwiML:", speechTwiml);
      
      let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>`;
      
      if (speechTwiml) {
        twiml += `
  ${speechTwiml}`;
      }
      
      twiml += `
  <Hangup/>
</Response>`;
      
      if (DEBUG) console.log("[Twilio Response] End conversation final TwiML:", twiml);
      
      return new NextResponse(twiml, {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Continue conversation
    if (DEBUG) console.log("[Twilio Response] Generated speech TwiML:", speechTwiml);
    if (DEBUG) console.log("[Twilio Response] Speech TwiML length:", speechTwiml.length);
    if (DEBUG) console.log("[Twilio Response] Generated speech TwiML:", speechTwiml);
    if (DEBUG) console.log("[Twilio Response] Speech TwiML length:", speechTwiml.length);
    
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>`;
    
    if (speechTwiml) {
      twiml += `
  ${speechTwiml}
  <Pause length="1"/>`;
    }
    
    twiml += `
  <Gather input="speech" method="POST" speechTimeout="auto" language="en-US" action="${escapedResponseUrl}" partialResultCallback="${escapedPartialCallback}" partialResultCallbackMethod="POST">
  </Gather>
  <Redirect>${escapedResponseUrl}</Redirect>
</Response>`;
    
    if (DEBUG) console.log("[Twilio Response] Final TwiML:", twiml);

    return new NextResponse(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  } catch (error) {
    console.error("[Twilio] Response error:", error);
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, we're experiencing technical difficulties. Please try again later.</Say>
  <Hangup/>
</Response>`;
    return new NextResponse(errorTwiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}

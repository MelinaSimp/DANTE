import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { xmlEscape, xmlEscapeAttr } from "@/lib/xml";
import { normalizePhone } from "@/lib/phone";
import { generateSpeechTwiml } from "@/lib/elevenlabs/twiml";
import { validateTwilioRequest } from "@/lib/twilio-validate";

export const dynamic = "force-dynamic";
const DEBUG = process.env.DEBUG_VOICE === "true";
export const maxDuration = 10;

/** Get call params from either GET (query) or POST (form). Twilio may use either. */
async function getIncomingCallParams(req: NextRequest): Promise<{ callSid: string; from: string; to: string; callStatus: string }> {
  if (req.method === "GET") {
    const p = req.nextUrl.searchParams;
    return {
      callSid: p.get("CallSid") || "",
      from: p.get("From") || "",
      to: p.get("To") || "",
      callStatus: p.get("CallStatus") || "",
    };
  }
  const formData = await req.formData();
  return {
    callSid: formData.get("CallSid")?.toString() || "",
    from: formData.get("From")?.toString() || "",
    to: formData.get("To")?.toString() || "",
    callStatus: formData.get("CallStatus")?.toString() || "",
  };
}

/**
 * Twilio Incoming Call Webhook (Optimized)
 * GET or POST /api/twilio/incoming
 *
 * Configure in Twilio: Voice & Fax > A CALL COMES IN > Webhook:
 * https://your-domain.com/api/twilio/incoming
 * (Set "HTTP GET" or "HTTP POST" – both are supported.)
 */
function validateEnvVars(): string | null {
  const missing: string[] = [];
  if (!process.env.OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
  if (!process.env.ELEVENLABS_API_KEY) missing.push("ELEVENLABS_API_KEY");
  if (missing.length > 0) return `Missing env vars: ${missing.join(", ")}`;
  return null;
}

async function handleIncoming(req: NextRequest): Promise<NextResponse> {
  let callSid = "";
  let from = "";
  let to = "";

  try {
    if (!(await validateTwilioRequest(req))) {
      console.warn("[Twilio Incoming] Invalid signature — rejecting request");
      return new NextResponse("Forbidden", { status: 403 });
    }

    const envError = validateEnvVars();
    if (envError) {
      console.error(`[Twilio Incoming] ${envError}`);
      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>We are experiencing technical difficulties. Please try again later.</Say><Hangup/></Response>`;
      return new NextResponse(twiml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
    }

    const params = await getIncomingCallParams(req);
    callSid = params.callSid;
    from = params.from;
    to = params.to;
    const callStatus = params.callStatus;

    if (DEBUG) console.log("[Twilio] Incoming call:", { callSid, from, to, callStatus });

    if (!to || !callSid) {
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, this line is not configured.</Say>
  <Hangup/>
</Response>`;
      return new NextResponse(errorTwiml, {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    // Normalize phone number for matching
    const normalizedTo = normalizePhone(to);
    if (!normalizedTo) {
      console.error("[Twilio] Invalid phone number format:", to);
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Invalid phone number format.</Say>
  <Hangup/>
</Response>`;
      return new NextResponse(errorTwiml, {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    // Look up agent by phone number (try multiple formats)
    // Generate all possible formats of the phone number
    const possibleFormats = [
      normalizedTo, // E.164: +12163508215
      to, // Original from Twilio: +12163508215
      normalizedTo?.replace(/^\+1/, ""), // Without country code: 2163508215
      to?.replace(/^\+1/, ""), // Without country code: 2163508215
      normalizedTo?.replace(/^\+1/, "").replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3"), // With spaces: 216 350 8215
      to?.replace(/^\+1/, "").replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3"), // With spaces: 216 350 8215
    ].filter(Boolean) as string[];

    // Remove duplicates
    const uniqueFormats = [...new Set(possibleFormats)];

    if (DEBUG) console.log("[Twilio] Looking for agent with phone number formats:", uniqueFormats);
    if (DEBUG) console.log("[Twilio] Original 'to' from Twilio:", to);
    if (DEBUG) console.log("[Twilio] Normalized 'to':", normalizedTo);

    // Try to find agent with any of these formats
    // ONLY voice or multi-modal agents (not chat-only)
    // This allows chat and voice agents to share the same phone number
    // SMS will route to chat/multi-modal, calls will route to voice/multi-modal
    // PRIORITY: Main receptionist (non-specialist) first, then specialists
    let { data: agent } = await supabaseAdmin
      .from("agents")
      .select("id, workspace_id, name, status, phone_number, elevenlabs_voice_id, is_specialist, parent_agent_id, modality")
      .in("phone_number", uniqueFormats)
      .in("modality", ["voice", "multi-modal"]) // Only voice or multi-modal agents for calls
      .eq("status", "deployed")
      .order("is_specialist", { ascending: true }) // false (main) first, then true (specialist)
      .order("parent_agent_id", { ascending: true, nullsFirst: true }) // agents without parent first
      .order("modality", { ascending: true }) // Prefer "voice" over "multi-modal" if both exist
      .limit(1)
      .maybeSingle();

    // If still not found, try case-insensitive partial matching
    if (!agent) {
      // Get all deployed agents to check manually
      // ONLY voice or multi-modal agents (not chat-only)
      // PRIORITY: Sort by is_specialist (main receptionist first) and parent_agent_id (nulls first)
      const { data: allDeployedAgents } = await supabaseAdmin
        .from("agents")
        .select("id, name, phone_number, status, is_specialist, parent_agent_id, modality")
        .in("modality", ["voice", "multi-modal"]) // Only voice or multi-modal agents
        .eq("status", "deployed")
        .order("is_specialist", { ascending: true }) // false (main) first
        .order("parent_agent_id", { ascending: true, nullsFirst: true }) // agents without parent first
        .order("modality", { ascending: true }); // Prefer "voice" over "multi-modal"

      if (DEBUG) console.log("[Twilio] All deployed agents:", allDeployedAgents);

      // Try to find a match by normalizing stored numbers
      // Prioritize main receptionist (non-specialist) over specialists
      if (allDeployedAgents) {
        // First pass: look for main receptionist (non-specialist)
        for (const candidate of allDeployedAgents) {
          if (!candidate.phone_number || candidate.is_specialist) continue;
          
          const normalizedCandidate = normalizePhone(candidate.phone_number);
          if (normalizedCandidate === normalizedTo || normalizedCandidate === to) {
            // Fetch full agent data including workspace_id
            const { data: fullAgent } = await supabaseAdmin
              .from("agents")
              .select("id, workspace_id, name, status, phone_number, elevenlabs_voice_id, is_specialist, parent_agent_id, modality")
              .eq("id", candidate.id)
              .single();
            if (fullAgent) {
              agent = fullAgent;
              if (DEBUG) console.log("[Twilio] Found main receptionist agent by normalizing stored number:", fullAgent);
              break;
            }
          }
        }
        
        // Second pass: if no main receptionist found, look for specialists
        if (!agent) {
          for (const candidate of allDeployedAgents) {
            if (!candidate.phone_number || !candidate.is_specialist) continue;
            
            const normalizedCandidate = normalizePhone(candidate.phone_number);
            if (normalizedCandidate === normalizedTo || normalizedCandidate === to) {
              // Fetch full agent data including workspace_id
              const { data: fullAgent } = await supabaseAdmin
                .from("agents")
                .select("id, workspace_id, name, status, phone_number, elevenlabs_voice_id, is_specialist, parent_agent_id, modality")
                .eq("id", candidate.id)
                .single();
              if (fullAgent) {
                agent = fullAgent;
                if (DEBUG) console.log("[Twilio] Found specialist agent by normalizing stored number (fallback):", fullAgent);
                break;
              }
            }
          }
        }
      }
    }

    if (!agent) {
      console.error("[Twilio] No voice/multi-modal agent found for phone number. Tried formats:", uniqueFormats);
      // Get all agents for debugging (including chat agents to show they exist but aren't used for voice)
      const { data: allAgents } = await supabaseAdmin
        .from("agents")
        .select("id, name, phone_number, status, modality");
      if (DEBUG) console.log("[Twilio] All agents in database:", allAgents);
      if (DEBUG) console.log("[Twilio] Note: Voice calls only work with 'voice' or 'multi-modal' agents. Chat-only agents are ignored.");
      
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>This number is not configured for the receptionist.</Say>
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
      if (DEBUG) console.log("[Twilio Incoming] Using VERCEL_URL (current deployment):", baseUrl);
    }
    
    // SECOND: Construct from request headers (also current deployment)
    if (!baseUrl) {
      const protocol = req.headers.get("x-forwarded-proto") || "https";
      const host = req.headers.get("host") || req.headers.get("x-forwarded-host") || req.nextUrl.host;
      if (host) {
        baseUrl = `${protocol}://${host}`;
        if (DEBUG) console.log("[Twilio Incoming] Using request host (current deployment):", baseUrl);
      }
    }
    
    // THIRD: Fallback to environment variables or custom domain
    if (!baseUrl) {
      baseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "https://driftai.studio";
      if (baseUrl === "https://driftai.studio") {
        if (DEBUG) console.log("[Twilio Incoming] Using custom domain: driftai.studio");
      } else {
        if (DEBUG) console.log("[Twilio Incoming] Using environment variable:", baseUrl);
      }
    }
    
    // Remove trailing slashes and any whitespace/newlines
    baseUrl = baseUrl.replace(/\/+$/, "").trim().replace(/\s+/g, "");
    
    if (DEBUG) console.log("[Twilio Incoming] Final base URL:", baseUrl);
    
    if (DEBUG) console.log("[Twilio] Using base URL:", baseUrl);
    if (DEBUG) console.log("[Twilio] Base URL length:", baseUrl.length);
    if (DEBUG) console.log("[Twilio] Base URL JSON:", JSON.stringify(baseUrl));

    // Create conversation
    const { data: scenarios } = await supabaseAdmin
      .from("scenarios")
      .select("id")
      .eq("agent_id", agent.id)
      .order("created_at", { ascending: true })
      .limit(1);

    const scenarioId = scenarios && scenarios.length > 0 ? scenarios[0].id : null;
    if (DEBUG) console.log("[Twilio] Agent ID:", agent.id);
    if (DEBUG) console.log("[Twilio] Found scenarios:", scenarios);
    if (DEBUG) console.log("[Twilio] Scenario ID:", scenarioId);

    let currentStepId: string | null = null;
    let greetingStep: { id: string; type: string; ai_message?: string; name?: string; sort_order?: number } | null = null;
    
    if (scenarioId) {
      // Get ALL steps to see what we have
      const { data: allSteps } = await supabaseAdmin
        .from("steps")
        .select("id, type, ai_message, name, sort_order")
        .eq("scenario_id", scenarioId)
        .order("sort_order", { ascending: true });
      
      if (DEBUG) console.log("[Twilio] All steps in scenario:", JSON.stringify(allSteps, null, 2));
      
      // Get the first "say" step for the greeting
      const saySteps = allSteps?.filter(s => s.type === "say") || [];
      if (DEBUG) console.log("[Twilio] Say steps found:", JSON.stringify(saySteps, null, 2));
      
      if (saySteps.length > 0) {
        greetingStep = saySteps[0];
        // Find the next step after the greeting (should be the Gather step)
        const greetingIndex = allSteps?.findIndex(s => s.id === greetingStep?.id) ?? -1;
        if (greetingIndex >= 0 && allSteps && greetingIndex < allSteps.length - 1) {
          // Set current_step_id to the next step (Gather step)
          currentStepId = allSteps[greetingIndex + 1].id;
          if (DEBUG) console.log("[Twilio] Selected greeting step:", JSON.stringify(greetingStep, null, 2));
          if (DEBUG) console.log("[Twilio] Setting current_step_id to next step:", currentStepId);
        } else {
          // If no next step, use greeting step ID (fallback)
          currentStepId = saySteps[0].id;
          if (DEBUG) console.log("[Twilio] Selected greeting step (no next step found):", JSON.stringify(greetingStep, null, 2));
        }
      } else if (allSteps && allSteps.length > 0) {
        // Fallback to first step of any type
        greetingStep = allSteps[0];
        // Try to find next step
        if (allSteps.length > 1) {
          currentStepId = allSteps[1].id;
        } else {
          currentStepId = allSteps[0].id;
        }
        if (DEBUG) console.log("[Twilio] No say steps, using first step:", JSON.stringify(greetingStep, null, 2));
      } else {
        if (DEBUG) console.log("[Twilio] No steps found in scenario");
      }
    }

    // Create conversation record
    const { data: conversation, error: conversationError } = await supabaseAdmin
      .from("conversations")
      .insert({
        agent_id: agent.id,
        workspace_id: agent.workspace_id,
        modality: "voice",
        channel_id: callSid,
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

    if (conversationError || !conversation) {
      console.error("[Twilio] Failed to create conversation:", conversationError);
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, we're experiencing technical difficulties. Please try again later.</Say>
  <Hangup/>
</Response>`;
      return new NextResponse(errorTwiml, {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    // Get first step message - only use configured messages, no fallbacks
    let greeting = "";
    
    if (greetingStep) {
      if (DEBUG) console.log("[Twilio] Greeting step data:", JSON.stringify(greetingStep, null, 2));
      if (DEBUG) console.log("[Twilio] Step ai_message value:", greetingStep.ai_message);
      if (DEBUG) console.log("[Twilio] Step name value:", greetingStep.name);
      if (DEBUG) console.log("[Twilio] Step type:", greetingStep.type);
      
      // Try ai_message first (this is the field that stores the actual message)
      const stepMessage = greetingStep.ai_message?.trim() || null;
      
      if (stepMessage && stepMessage.length > 0) {
        greeting = stepMessage;
        if (DEBUG) console.log("[Twilio] ✅ Using greeting from step ai_message:", greeting.substring(0, 100) + "...");
      } else {
        // Fallback to name if ai_message is empty
        // Check if name looks like an actual message (not just "Step 1" or "Welcome! How can I help you today?")
        const nameMessage = greetingStep.name?.trim() || null;
        if (nameMessage && nameMessage.length > 0) {
          // Use name if it's longer than 15 chars or doesn't look like a default/placeholder
          const isDefaultMessage = nameMessage.includes("Welcome! How can I help") || 
                                   nameMessage.includes("Step") && nameMessage.length < 20;
          
          if (!isDefaultMessage || nameMessage.length > 15) {
            greeting = nameMessage;
            if (DEBUG) console.log("[Twilio] ⚠️ Using greeting from step name (ai_message was empty):", greeting.substring(0, 100) + "...");
          } else {
            if (DEBUG) console.log("[Twilio] ❌ Step name looks like placeholder. ai_message:", greetingStep.ai_message, "name:", greetingStep.name);
            if (DEBUG) console.log("[Twilio] No greeting configured - will skip Say tag");
          }
        } else {
          if (DEBUG) console.log("[Twilio] ❌ Step has no usable message. ai_message:", greetingStep.ai_message, "name:", greetingStep.name);
          if (DEBUG) console.log("[Twilio] No greeting configured - will skip Say tag");
        }
      }
    } else {
      if (DEBUG) console.log("[Twilio] ❌ No greeting step found, no greeting configured - will skip Say tag");
    }

    // Always have a greeting so the call never drops (e.g. instructions-only agents with no scenarios)
    if (!greeting || greeting.trim().length === 0) {
      greeting = "Hello! How can I help you today?";
      if (DEBUG) console.log("[Twilio] Using default greeting (no scenario/step message)");
    }

    // The response endpoint is called automatically by Twilio's <Gather> action
    if (!conversation || !conversation.id) {
      console.error("[Twilio] Conversation ID is missing:", conversation);
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
    
    // Ensure baseUrl doesn't have trailing slash and is clean
    const cleanBaseUrl = baseUrl.trim().replace(/\/+$/, "").replace(/\s+/g, "");
    const responseUrl = `${cleanBaseUrl}/api/twilio/response?callSid=${encodeURIComponent(callSid)}&conversationId=${encodeURIComponent(conversation.id)}`;
    
    if (DEBUG) console.log("[Twilio] Constructed response URL:", responseUrl);
    if (DEBUG) console.log("[Twilio] Response URL JSON:", JSON.stringify(responseUrl));
    if (DEBUG) console.log("[Twilio] Base URL:", baseUrl);
    if (DEBUG) console.log("[Twilio] Call SID:", callSid);
    if (DEBUG) console.log("[Twilio] Conversation ID:", conversation.id);
    
    // Validate URL before using
    try {
      const testUrl = new URL(responseUrl);
      if (DEBUG) console.log("[Twilio] URL validation passed:", testUrl.href);
    } catch (error) {
      console.error("[Twilio] Invalid response URL constructed:", responseUrl);
      console.error("[Twilio] URL validation error:", error);
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
    const cleanResponseUrl = responseUrl.trim().replace(/\s+/g, "").replace(/\n/g, "").replace(/\r/g, "");
    const escapedResponseUrl = xmlEscapeAttr(cleanResponseUrl);
    if (DEBUG) console.log("[Twilio] Clean response URL:", cleanResponseUrl);
    if (DEBUG) console.log("[Twilio] Escaped response URL:", escapedResponseUrl);
    if (DEBUG) console.log("[Twilio] Escaped URL JSON:", JSON.stringify(escapedResponseUrl));

    // Only include speech if there's a greeting configured
    const hasGreeting = greeting && greeting.trim().length > 0;
    
    if (DEBUG) console.log("[Twilio Incoming] Generating greeting speech...");
    if (DEBUG) console.log("[Twilio Incoming] Has greeting:", hasGreeting);
    if (DEBUG) console.log("[Twilio Incoming] Greeting text:", greeting?.substring(0, 100));
    if (DEBUG) console.log("[Twilio Incoming] Agent voice ID:", agent.elevenlabs_voice_id);
    if (DEBUG) console.log("[Twilio Incoming] Base URL:", baseUrl);
    
    // Generate speech TwiML (Say or Play based on agent voice configuration)
    const speechTwiml = hasGreeting
      ? await generateSpeechTwiml(greeting, agent.elevenlabs_voice_id, baseUrl)
      : "";
    
    if (DEBUG) console.log("[Twilio Incoming] Generated speech TwiML:", speechTwiml);
    if (DEBUG) console.log("[Twilio Incoming] Speech TwiML length:", speechTwiml.length);

    // Generate TwiML response
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>`;
    
    if (speechTwiml) {
      twiml += `
  ${speechTwiml}
  <Pause length="1"/>`;
    }
    
    if (DEBUG) console.log("[Twilio Incoming] Final TwiML:", twiml);
    
    twiml += `
  <Gather input="speech" action="${escapedResponseUrl}" method="POST" speechTimeout="auto" language="en-US">
  </Gather>
  <Redirect>${escapedResponseUrl}</Redirect>
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
      },
    });
  } catch (error: any) {
    console.error("[Twilio] Incoming call error:", error);
    
    // Log error
    const { logError, generateErrorTwiML } = await import("@/lib/errors/logger");
    await logError({
      type: "twilio_incoming_error",
      source: "/api/twilio/incoming",
      error,
      context: { callSid, from, to },
      timestamp: new Date().toISOString(),
      severity: "high"
    });
    
    const errorTwiml = generateErrorTwiML("Sorry, we're experiencing technical difficulties. Please try again later.");
    return new NextResponse(errorTwiml, {
      status: 200,
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
      },
    });
  }
}

export async function POST(req: NextRequest) {
  return handleIncoming(req);
}

export async function GET(req: NextRequest) {
  return handleIncoming(req);
}

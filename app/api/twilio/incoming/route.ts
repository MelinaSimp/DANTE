import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { xmlEscape, xmlEscapeAttr } from "@/lib/xml";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";
export const maxDuration = 10; // 10 seconds max for Twilio webhooks

/**
 * Twilio Incoming Call Webhook
 * POST /api/twilio/incoming
 * 
 * This endpoint receives incoming call webhooks from Twilio
 * Configure this URL in your Twilio phone number settings:
 * Voice & Fax > A CALL COMES IN > Webhook
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const callSid = formData.get("CallSid")?.toString() || "";
    const from = formData.get("From")?.toString() || "";
    const to = formData.get("To")?.toString() || "";
    const callStatus = formData.get("CallStatus")?.toString() || "";

    console.log("[Twilio] Incoming call:", { callSid, from, to, callStatus });

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

    console.log("[Twilio] Looking for agent with phone number formats:", uniqueFormats);
    console.log("[Twilio] Original 'to' from Twilio:", to);
    console.log("[Twilio] Normalized 'to':", normalizedTo);

    // Try to find agent with any of these formats
    let { data: agent } = await supabaseAdmin
      .from("agents")
      .select("id, workspace_id, name, status, phone_number")
      .in("phone_number", uniqueFormats)
      .eq("status", "deployed")
      .maybeSingle();

    // If still not found, try case-insensitive partial matching
    if (!agent) {
      // Get all deployed agents to check manually
      const { data: allDeployedAgents } = await supabaseAdmin
        .from("agents")
        .select("id, name, phone_number, status")
        .eq("status", "deployed");

      console.log("[Twilio] All deployed agents:", allDeployedAgents);

      // Try to find a match by normalizing stored numbers
      if (allDeployedAgents) {
        for (const candidate of allDeployedAgents) {
          if (!candidate.phone_number) continue;
          
          const normalizedCandidate = normalizePhone(candidate.phone_number);
          if (normalizedCandidate === normalizedTo || normalizedCandidate === to) {
            // Fetch full agent data including workspace_id
            const { data: fullAgent } = await supabaseAdmin
              .from("agents")
              .select("id, workspace_id, name, status, phone_number")
              .eq("id", candidate.id)
              .single();
            if (fullAgent) {
              agent = fullAgent;
              console.log("[Twilio] Found agent by normalizing stored number:", fullAgent);
              break;
            }
          }
        }
      }
    }

    if (!agent) {
      console.error("[Twilio] Agent not found for phone number. Tried formats:", uniqueFormats);
      // Get all agents for debugging
      const { data: allAgents } = await supabaseAdmin
        .from("agents")
        .select("id, name, phone_number, status");
      console.log("[Twilio] All agents in database:", allAgents);
      
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

    // Get base URL - prefer environment variable, otherwise construct from request
    let baseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "";
    
    // If VERCEL_URL is set, add protocol if missing
    if (!baseUrl && process.env.VERCEL_URL) {
      const vercelUrl = process.env.VERCEL_URL;
      baseUrl = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
    }
    
    // If still no URL, construct from request (most reliable)
    if (!baseUrl) {
      const protocol = req.headers.get("x-forwarded-proto") || "https";
      const host = req.headers.get("host") || req.headers.get("x-forwarded-host") || req.nextUrl.host;
      if (host) {
        baseUrl = `${protocol}://${host}`;
      }
    }
    
    // Final fallback to production URL (hardcoded as last resort)
    if (!baseUrl || !baseUrl.startsWith("http")) {
      baseUrl = "https://driftai.studio";
      console.warn("[Twilio] Using hardcoded fallback URL:", baseUrl);
    }
    
    // Remove trailing slashes and any whitespace/newlines
    baseUrl = baseUrl.replace(/\/+$/, "").trim().replace(/\s+/g, "");
    
    console.log("[Twilio] Using base URL:", baseUrl);
    console.log("[Twilio] Base URL length:", baseUrl.length);
    console.log("[Twilio] Base URL JSON:", JSON.stringify(baseUrl));

    // Create conversation
    const { data: scenarios } = await supabaseAdmin
      .from("scenarios")
      .select("id")
      .eq("agent_id", agent.id)
      .order("created_at", { ascending: true })
      .limit(1);

    const scenarioId = scenarios && scenarios.length > 0 ? scenarios[0].id : null;
    console.log("[Twilio] Agent ID:", agent.id);
    console.log("[Twilio] Found scenarios:", scenarios);
    console.log("[Twilio] Scenario ID:", scenarioId);

    let currentStepId = null;
    let greetingStep = null;
    
    if (scenarioId) {
      // Get ALL steps to see what we have
      const { data: allSteps } = await supabaseAdmin
        .from("steps")
        .select("id, type, ai_message, name, sort_order")
        .eq("scenario_id", scenarioId)
        .order("sort_order", { ascending: true });
      
      console.log("[Twilio] All steps in scenario:", JSON.stringify(allSteps, null, 2));
      
      // Get the first "say" step for the greeting
      const saySteps = allSteps?.filter(s => s.type === "say") || [];
      console.log("[Twilio] Say steps found:", JSON.stringify(saySteps, null, 2));
      
      if (saySteps.length > 0) {
        greetingStep = saySteps[0];
        // After speaking the greeting, advance to the next step so it doesn't repeat
        // Find the next step after the greeting by sort_order
        const greetingSortOrder = saySteps[0].sort_order || 0;
        const nextStep = allSteps?.find(s => (s.sort_order || 0) > greetingSortOrder);
        if (nextStep) {
          currentStepId = nextStep.id;
          console.log("[Twilio] Selected greeting step:", JSON.stringify(greetingStep, null, 2));
          console.log("[Twilio] Advanced to next step after greeting:", nextStep.id, nextStep.type);
        } else {
          // No next step found, keep greeting step ID (shouldn't happen in normal flow)
          currentStepId = saySteps[0].id;
          console.log("[Twilio] Selected greeting step (no next step found):", JSON.stringify(greetingStep, null, 2));
        }
      } else if (allSteps && allSteps.length > 0) {
        // Fallback to first step of any type
        greetingStep = allSteps[0];
        // Advance to next step if available
        const firstSortOrder = allSteps[0].sort_order || 0;
        const nextStep = allSteps.find(s => (s.sort_order || 0) > firstSortOrder);
        currentStepId = nextStep?.id || allSteps[0].id;
        console.log("[Twilio] No say steps, using first step:", JSON.stringify(greetingStep, null, 2));
      } else {
        console.log("[Twilio] No steps found in scenario");
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
      console.log("[Twilio] Greeting step data:", JSON.stringify(greetingStep, null, 2));
      console.log("[Twilio] Step ai_message value:", greetingStep.ai_message);
      console.log("[Twilio] Step name value:", greetingStep.name);
      console.log("[Twilio] Step type:", greetingStep.type);
      
      // Try ai_message first (this is the field that stores the actual message)
      const stepMessage = greetingStep.ai_message?.trim() || null;
      
      if (stepMessage && stepMessage.length > 0) {
        greeting = stepMessage;
        console.log("[Twilio] ✅ Using greeting from step ai_message:", greeting.substring(0, 100) + "...");
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
            console.log("[Twilio] ⚠️ Using greeting from step name (ai_message was empty):", greeting.substring(0, 100) + "...");
          } else {
            console.log("[Twilio] ❌ Step name looks like placeholder. ai_message:", greetingStep.ai_message, "name:", greetingStep.name);
            console.log("[Twilio] No greeting configured - will skip Say tag");
          }
        } else {
          console.log("[Twilio] ❌ Step has no usable message. ai_message:", greetingStep.ai_message, "name:", greetingStep.name);
          console.log("[Twilio] No greeting configured - will skip Say tag");
        }
      }
    } else {
      console.log("[Twilio] ❌ No greeting step found, no greeting configured - will skip Say tag");
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
    
    console.log("[Twilio] Constructed response URL:", responseUrl);
    console.log("[Twilio] Response URL JSON:", JSON.stringify(responseUrl));
    console.log("[Twilio] Base URL:", baseUrl);
    console.log("[Twilio] Call SID:", callSid);
    console.log("[Twilio] Conversation ID:", conversation.id);
    
    // Validate URL before using
    try {
      const testUrl = new URL(responseUrl);
      console.log("[Twilio] URL validation passed:", testUrl.href);
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
    console.log("[Twilio] Clean response URL:", cleanResponseUrl);
    console.log("[Twilio] Escaped response URL:", escapedResponseUrl);
    console.log("[Twilio] Escaped URL JSON:", JSON.stringify(escapedResponseUrl));

    // Only include Say tag if there's a greeting configured
    const hasGreeting = greeting && greeting.trim().length > 0;
    const escapedGreeting = hasGreeting ? xmlEscape(greeting) : "";

    // Generate TwiML response
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>`;
    
    if (hasGreeting) {
      twiml += `
  <Say voice="alice">${escapedGreeting}</Say>
  <Pause length="1"/>`;
    }
    
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
  } catch (error) {
    console.error("[Twilio] Incoming call error:", error);
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, we're experiencing technical difficulties. Please try again later.</Say>
  <Hangup/>
</Response>`;
    return new NextResponse(errorTwiml, {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
      },
    });
  }
}

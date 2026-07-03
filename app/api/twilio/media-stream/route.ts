/**
 * Twilio Media Streams WebSocket Handler
 * 
 * This endpoint handles real-time bidirectional audio streaming via WebSocket
 * for ultra-low latency voice calls (200-500ms vs 1-2 seconds with Gather).
 * 
 * Configure in Twilio Console:
 * Phone Number > Voice Configuration > A call comes in > Webhook: https://driftai.studio/api/twilio/media-stream
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { generateSpeechTwiml } from "@/lib/elevenlabs/twiml";
import { validateTwilioRequest } from "@/lib/twilio-validate";
import { xmlEscape } from "@/lib/xml";
import { DEFAULT_RECORDING_DISCLOSURE } from "@/lib/voice/disclosure";

export const dynamic = "force-dynamic";
const DEBUG = process.env.DEBUG_VOICE === "true";
export const maxDuration = 10;

// Helper function to extract call information from either GET (query params) or POST (form data)
async function getCallInfo(req: NextRequest) {
  // Try GET query parameters first (if method is GET)
  let callSid = req.nextUrl.searchParams.get("CallSid") || "";
  let from = req.nextUrl.searchParams.get("From") || "";
  let to = req.nextUrl.searchParams.get("To") || "";
  
  // If no query params, try form data (if method is POST)
  if (!callSid || !to) {
    try {
      const formData = await req.formData();
      callSid = formData.get("CallSid")?.toString() || callSid;
      from = formData.get("From")?.toString() || from;
      to = formData.get("To")?.toString() || to;
    } catch (e) {
      // If formData fails, use query params (already set)
    }
  }
  
  return { callSid, from, to };
}

function generateErrorTwiML(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${message}</Say>
  <Hangup/>
</Response>`;
}

// Helper function to get greeting from step
async function getGreetingFromStep(stepId: string): Promise<string> {
  try {
    const { data: step } = await supabaseAdmin
      .from("steps")
      .select("ai_message, name, type")
      .eq("id", stepId)
      .single();
    
    if (step && step.type === "say") {
      return step.ai_message || step.name || "Hello! How can I help you today?";
    }
    return "Hello! How can I help you today?";
  } catch (error) {
    console.error("[Media Stream] Error getting greeting from step:", error);
    return "Hello! How can I help you today?";
  }
}

async function handleMediaStream(req: NextRequest) {
  let callSid = "";
  let from = "";
  let to = "";
  
  try {
    if (!(await validateTwilioRequest(req))) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const missingVars: string[] = [];
    if (!process.env.OPENAI_API_KEY) missingVars.push("OPENAI_API_KEY");
    if (!process.env.ELEVENLABS_API_KEY) missingVars.push("ELEVENLABS_API_KEY");
    if (missingVars.length > 0) {
      console.error(`[Media Stream] Missing env vars: ${missingVars.join(", ")}`);
      return new NextResponse(generateErrorTwiML("We are experiencing technical difficulties. Please try again later."), {
        status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    const callInfo = await getCallInfo(req);
    callSid = callInfo.callSid;
    from = callInfo.from;
    to = callInfo.to;

    if (DEBUG) console.log("[Media Stream] WebSocket connection request:", { callSid, from, to });

    if (!callSid || !to) {
      console.error("[Media Stream] Missing call information:", { callSid, to });
      return new NextResponse(generateErrorTwiML("Sorry, this line is not configured."), {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    // Find agent by phone number
    const normalizedPhone = normalizePhone(to);
    if (!normalizedPhone) {
      console.error("[Media Stream] Invalid phone number format:", to);
      return new NextResponse(generateErrorTwiML("Invalid phone number format."), {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    const possibleFormats = [
      normalizedPhone,
      to,
      normalizedPhone.replace(/^\+1/, ""),
      to.replace(/^\+1/, ""),
    ].filter(Boolean) as string[];

    const uniqueFormats = [...new Set(possibleFormats)];

    const { data: agent, error: agentError } = await supabaseAdmin
      .from("agents")
      .select("id, workspace_id, name, status, phone_number, elevenlabs_voice_id, modality")
      .in("phone_number", uniqueFormats)
      .in("modality", ["voice", "multi-modal"])
      .eq("status", "deployed")
      .limit(1)
      .maybeSingle();

    if (agentError) {
      console.error("[Media Stream] Database error finding agent:", agentError);
      return new NextResponse(generateErrorTwiML("Database error. Please try again."), {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    if (!agent) {
      console.error("[Media Stream] Agent not found for phone number:", uniqueFormats);
      return new NextResponse(generateErrorTwiML("Agent not found for this number."), {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    // Create or get conversation
    const { data: conversationInit, error: conversationError } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("channel_id", callSid)
      .eq("modality", "voice")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // `conversation` is reassigned below (line ~217) when we create a new
    // row, so it stays `let`; `conversationError` is read-only → const.
    let conversation = conversationInit;

    if (conversationError) {
      console.error("[Media Stream] Database error finding conversation:", conversationError);
    }

    if (!conversation) {
      // Create new conversation
      const { data: scenarios } = await supabaseAdmin
        .from("scenarios")
        .select("id")
        .eq("agent_id", agent.id)
        .order("created_at", { ascending: true })
        .limit(1);

      const scenarioId = scenarios && scenarios.length > 0 ? scenarios[0].id : null;
      let currentStepId: string | null = null;

      if (scenarioId) {
        const { data: steps } = await supabaseAdmin
          .from("steps")
          .select("id")
          .eq("scenario_id", scenarioId)
          .order("sort_order", { ascending: true })
          .limit(1);

        if (steps && steps.length > 0) {
          currentStepId = steps[0].id;
        }
      }

      const { data: newConversation, error: createError } = await supabaseAdmin
        .from("conversations")
        .insert({
          channel_id: callSid,
          agent_id: agent.id,
          workspace_id: agent.workspace_id,
          modality: "voice",
          status: "active",
          current_scenario_id: scenarioId,
          current_step_id: currentStepId,
          metadata: {
            phoneNumber: to,
            customerNumber: from,
            mediaStream: true,
          },
        })
        .select()
        .single();

      if (createError) {
        console.error("[Media Stream] Failed to create conversation:", createError);
        return new NextResponse(generateErrorTwiML("Failed to initialize call session."), {
          status: 200,
          headers: { "Content-Type": "text/xml; charset=utf-8" },
        });
      }

      conversation = newConversation;
    }

    // Use the request origin as the canonical base URL for any TwiML redirects/actions.
    // This avoids Twilio being sent to stale Vercel deployment URLs (which can 404).
    const requestOrigin = new URL(req.url).origin;
    const baseUrl = requestOrigin;
    
    // Railway WebSocket server URL (set via environment variable or use default)
    let railwayUrl = process.env.RAILWAY_WEBSOCKET_URL || "wss://motivated-perfection-production.up.railway.app";
    
    // Validate Railway URL format
    if (!railwayUrl.startsWith("wss://") && !railwayUrl.startsWith("ws://")) {
      console.warn("[Media Stream] Railway URL missing protocol, adding wss://");
      railwayUrl = railwayUrl.startsWith("http://") 
        ? railwayUrl.replace("http://", "wss://")
        : railwayUrl.startsWith("https://")
        ? railwayUrl.replace("https://", "wss://")
        : `wss://${railwayUrl}`;
    }
    
    // Validate URL doesn't have trailing slashes or spaces
    railwayUrl = railwayUrl.trim().replace(/\/+$/, "");
    
    // Checkpoint: Use Media Streams by default when Railway URL is set; opt-out with FORCE_REGULAR_TWILIO=true.
    const forceRegularTwilio = process.env.FORCE_REGULAR_TWILIO === "true";
    const useMediaStreams = !forceRegularTwilio;
    
    if (forceRegularTwilio) {
      if (DEBUG) console.log("[Media Stream] FORCE_REGULAR_TWILIO env var is set - skipping Media Streams");
    } else {
      try {
        const healthUrl = railwayUrl.replace("wss://", "https://").replace("ws://", "http://") + "/health";
        if (DEBUG) console.log("[Media Stream] Checking Railway health:", healthUrl);
        
        // Increased timeout to 5 seconds and make it non-blocking
        // If health check fails, we'll still try Media Streams (Railway might be slow but working)
        const healthCheckPromise = fetch(healthUrl, { 
          method: "GET",
          signal: AbortSignal.timeout(5000) // 5 second timeout
        }).catch((error) => {
          console.warn("[Media Stream] Railway health check fetch error:", error.message);
          return null;
        });
        
        // Don't wait for health check - proceed with Media Streams if Railway URL is configured
        // The health check is just a warning, not a blocker
        healthCheckPromise.then((healthCheck) => {
          if (healthCheck && healthCheck.ok) {
            healthCheck.json().then((healthData) => {
              if (DEBUG) console.log("[Media Stream] Railway health check passed", healthData);
            }).catch(() => {});
          } else {
            console.warn("[Media Stream] Railway health check failed, but proceeding with Media Streams anyway");
          }
        }).catch(() => {});
        
        // Always use Media Streams if Railway URL is configured (health check is just informational)
        if (DEBUG) console.log("[Media Stream] Proceeding with Media Streams (health check is non-blocking)");
      } catch (healthError: any) {
        console.warn("[Media Stream] Railway health check error (non-blocking):", healthError?.message || healthError);
        // Don't disable Media Streams on health check error - Railway might still work
      }
    }
    
    let twiml: string;

    // Fetch the workspace's recording disclosure (or fall back to the
    // default). Spoken before either the Media Streams connect or the
    // fallback <Say> so every voice entry point gets disclosed.
    // Two-party-consent states require the caller to hear this before
    // any transcription begins.
    const { data: workspace } = await supabaseAdmin
      .from("workspaces")
      .select("recording_disclosure")
      .eq("id", agent.workspace_id)
      .maybeSingle();
    const disclosureText = (
      workspace?.recording_disclosure?.trim() || DEFAULT_RECORDING_DISCLOSURE
    ).trim();
    const disclosureSay = `<Say voice="alice">${xmlEscape(disclosureText)}</Say>`;

    if (useMediaStreams) {
      // Use <Connect><Stream> for BIDIRECTIONAL audio. <Start><Stream> is receive-only.
      // Twilio: "The url does not support query string parameters." Use <Parameter> instead.
      const mediaStreamUrl = `${railwayUrl}/media-stream`;
      const convIdEscaped = conversation.id.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

      // Disclosure plays first, then the Railway WebSocket takes over
      // for the bidirectional conversation. Railway's own greeting
      // comes after the disclosure, which is the order the caller
      // expects ("heads up, then hello").
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${disclosureSay}
  <Connect>
    <Stream url="${mediaStreamUrl}">
      <Parameter name="conversationId" value="${convIdEscaped}" />
    </Stream>
  </Connect>
</Response>`;
      
      if (DEBUG) console.log("[Media Stream] Using Media Streams (Connect+Stream, bidirectional)");
      if (DEBUG) console.log("[Media Stream] Railway URL:", mediaStreamUrl);
      if (DEBUG) console.log("[Media Stream] conversationId (Parameter):", conversation.id);
    } else {
      // Fallback to regular Twilio flow if Railway is unavailable
      if (DEBUG) console.log("[Media Stream] Falling back to regular Twilio flow");
      const responseUrl = `${baseUrl}/api/twilio/response?callSid=${encodeURIComponent(callSid)}&conversationId=${conversation.id}`;
      
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${disclosureSay}
  <Say>Hello! How can I help you today?</Say>
  <Pause length="1"/>
  <Gather input="speech" method="POST" speechTimeout="auto" language="en-US" action="${responseUrl.replace(/&/g, "&amp;")}">
  </Gather>
  <Redirect>${responseUrl.replace(/&/g, "&amp;")}</Redirect>
</Response>`;
      
      if (DEBUG) console.log("[Media Stream] Using fallback TwiML with response URL:", responseUrl);
    }

    return new NextResponse(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  } catch (error: any) {
    console.error("[Media Stream] Unexpected error:", error);
    return new NextResponse(generateErrorTwiML("An unexpected error occurred. Please try again."), {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }
}

// TwiML handler for Media Streams initialization
export async function GET(req: NextRequest) {
  return handleMediaStream(req);
}

// Also support POST (Twilio can use either GET or POST)
export async function POST(req: NextRequest) {
  return handleMediaStream(req);
}

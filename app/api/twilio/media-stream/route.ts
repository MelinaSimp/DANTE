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

export const dynamic = "force-dynamic";
export const maxDuration = 10; // 10 seconds max for Twilio webhooks

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

// Main handler for Media Streams initialization
async function handleMediaStream(req: NextRequest) {
  // Declare variables outside try block so they're accessible in catch
  let callSid = "";
  let from = "";
  let to = "";
  
  try {
    const callInfo = await getCallInfo(req);
    callSid = callInfo.callSid;
    from = callInfo.from;
    to = callInfo.to;

    console.log("[Media Stream] WebSocket connection request:", { callSid, from, to });

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
    let { data: conversation, error: conversationError } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("channel_id", callSid)
      .eq("modality", "voice")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

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

    // Return TwiML that enables Media Streams, connecting to Railway WebSocket server
    const baseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "https://driftai.studio";
    
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
    
    // Check Railway health before using (non-blocking)
    let useMediaStreams = true;
    try {
      const healthUrl = railwayUrl.replace("wss://", "https://").replace("ws://", "http://") + "/health";
      console.log("[Media Stream] Checking Railway health:", healthUrl);
      
      const healthCheck = await fetch(healthUrl, { 
        method: "GET",
        signal: AbortSignal.timeout(2000) // 2 second timeout
      }).catch((error) => {
        console.warn("[Media Stream] Railway health check fetch error:", error.message);
        return null;
      });
      
      if (!healthCheck) {
        console.warn("[Media Stream] Railway health check failed (no response), falling back to regular Twilio flow");
        useMediaStreams = false;
      } else if (!healthCheck.ok) {
        console.warn(`[Media Stream] Railway health check failed (status: ${healthCheck.status}), falling back to regular Twilio flow`);
        useMediaStreams = false;
      } else {
        const healthData = await healthCheck.json().catch(() => null);
        console.log("[Media Stream] Railway health check passed, using Media Streams", healthData);
      }
    } catch (healthError: any) {
      console.warn("[Media Stream] Railway health check error (non-blocking):", healthError?.message || healthError);
      useMediaStreams = false;
      // Continue anyway - fallback to regular Twilio flow
    }
    
    let twiml: string;
    
    if (useMediaStreams) {
      // Build Media Stream URL with proper encoding
      const mediaStreamUrl = `${railwayUrl}/media-stream?CallSid=${encodeURIComponent(callSid)}&From=${encodeURIComponent(from)}&To=${encodeURIComponent(to)}&conversationId=${encodeURIComponent(conversation.id)}`;
      
      // Media Streams handles ALL audio via WebSocket - don't use <Say> here
      // The Railway server will send the greeting audio through the WebSocket
      // The <Stream> tag keeps the call active indefinitely until the WebSocket closes
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Stream url="${mediaStreamUrl.replace(/&/g, "&amp;")}" />
  </Start>
</Response>`;
      
      console.log("[Media Stream] ✅ Using Media Streams");
      console.log("[Media Stream] Railway URL:", railwayUrl);
      console.log("[Media Stream] Full Media Stream URL:", mediaStreamUrl);
      console.log("[Media Stream] Returning TwiML:", twiml);
    } else {
      // Fallback to regular Twilio flow if Railway is unavailable
      console.log("[Media Stream] Falling back to regular Twilio flow");
      const responseUrl = `${baseUrl}/api/twilio/response?callSid=${encodeURIComponent(callSid)}&conversationId=${conversation.id}`;
      
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Hello! How can I help you today?</Say>
  <Pause length="1"/>
  <Gather input="speech" method="POST" speechTimeout="auto" language="en-US" action="${responseUrl.replace(/&/g, "&amp;")}">
  </Gather>
</Response>`;
      
      console.log("[Media Stream] Using fallback TwiML with response URL:", responseUrl);
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

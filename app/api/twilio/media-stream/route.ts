/**
 * Twilio Media Streams WebSocket Handler
 * 
 * This endpoint handles real-time bidirectional audio streaming via WebSocket
 * for ultra-low latency voice calls (200-500ms vs 1-2 seconds with Gather).
 * 
 * Configure in Twilio Console:
 * Phone Number > Voice Configuration > Media Streams > Enable
 * WebSocket URL: wss://driftai.studio/api/twilio/media-stream
 */

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { AgentExecutor, ConversationContext } from "@/lib/agent-executor/executor";
import { generateSpeechTwiml } from "@/lib/elevenlabs/twiml";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for WebSocket connections

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

// TwiML handler for Media Streams initialization
export async function GET(req: NextRequest) {
  const { callSid, from, to } = await getCallInfo(req);

  console.log("[Media Stream] WebSocket connection request:", { callSid, from, to });

  if (!callSid || !to) {
    return new Response("Missing call information", { status: 400 });
  }

  // Find agent by phone number
  const normalizedPhone = normalizePhone(to);
  if (!normalizedPhone) {
    return new Response("Invalid phone number format", { status: 400 });
  }

  const possibleFormats = [
    normalizedPhone,
    to,
    normalizedPhone.replace(/^\+1/, ""),
    to.replace(/^\+1/, ""),
  ].filter(Boolean) as string[];

  const uniqueFormats = [...new Set(possibleFormats)];

  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("id, workspace_id, name, status, phone_number, elevenlabs_voice_id, modality")
    .in("phone_number", uniqueFormats)
    .in("modality", ["voice", "multi-modal"])
    .eq("status", "deployed")
    .limit(1)
    .maybeSingle();

  if (!agent) {
    return new Response("Agent not found", { status: 404 });
  }

  // Create or get conversation
  let { data: conversation } = await supabaseAdmin
    .from("conversations")
    .select("*")
    .eq("channel_id", callSid)
    .eq("modality", "voice")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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

    const { data: newConversation } = await supabaseAdmin
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

    conversation = newConversation;
  }

  // Return TwiML that enables Media Streams, connecting to Railway WebSocket server
  const baseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "https://driftai.studio";
  // Railway WebSocket server URL (set via environment variable or use default)
  const railwayUrl = process.env.RAILWAY_WEBSOCKET_URL || "wss://motivated-perfection-production.up.railway.app";
  const mediaStreamUrl = `${railwayUrl}/media-stream?CallSid=${callSid}&From=${encodeURIComponent(from)}&To=${encodeURIComponent(to)}`;

  // Media Streams handles all audio via WebSocket - no need for <Gather>
  // The Railway server will handle the conversation flow
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Stream url="${mediaStreamUrl}" />
  </Start>
  <Say>Hello! How can I help you today?</Say>
</Response>`;

  return new Response(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

// Also support POST (Twilio can use either GET or POST)
export async function POST(req: NextRequest) {
  const { callSid, from, to } = await getCallInfo(req);

  console.log("[Media Stream] WebSocket connection request:", { callSid, from, to });

  if (!callSid || !to) {
    return new Response("Missing call information", { status: 400 });
  }

  // Find agent by phone number
  const normalizedPhone = normalizePhone(to);
  if (!normalizedPhone) {
    return new Response("Invalid phone number format", { status: 400 });
  }

  const possibleFormats = [
    normalizedPhone,
    to,
    normalizedPhone.replace(/^\+1/, ""),
    to.replace(/^\+1/, ""),
  ].filter(Boolean) as string[];

  const uniqueFormats = [...new Set(possibleFormats)];

  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("id, workspace_id, name, status, phone_number, elevenlabs_voice_id, modality")
    .in("phone_number", uniqueFormats)
    .in("modality", ["voice", "multi-modal"])
    .eq("status", "deployed")
    .limit(1)
    .maybeSingle();

  if (!agent) {
    return new Response("Agent not found", { status: 404 });
  }

  // Create or get conversation
  let { data: conversation } = await supabaseAdmin
    .from("conversations")
    .select("*")
    .eq("channel_id", callSid)
    .eq("modality", "voice")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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

    const { data: newConversation } = await supabaseAdmin
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

    conversation = newConversation;
  }

  // Return TwiML that enables Media Streams, connecting to Railway WebSocket server
  const baseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "https://driftai.studio";
  // Railway WebSocket server URL (set via environment variable or use default)
  const railwayUrl = process.env.RAILWAY_WEBSOCKET_URL || "wss://motivated-perfection-production.up.railway.app";
  const mediaStreamUrl = `${railwayUrl}/media-stream?CallSid=${callSid}&From=${encodeURIComponent(from)}&To=${encodeURIComponent(to)}`;

  // Media Streams handles all audio via WebSocket - no need for <Gather>
  // The Railway server will handle the conversation flow
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Stream url="${mediaStreamUrl}" />
  </Start>
  <Say>Hello! How can I help you today?</Say>
</Response>`;

  return new Response(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

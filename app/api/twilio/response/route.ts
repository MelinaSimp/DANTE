import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AgentExecutor, ConversationContext } from "@/lib/agent-executor/executor";
import { xmlEscape, xmlEscapeAttr } from "@/lib/xml";

export const dynamic = "force-dynamic";
export const maxDuration = 10; // 10 seconds max for Twilio webhooks

/**
 * Twilio Response Handler
 * POST /api/twilio/response
 * 
 * This endpoint handles user speech responses during a call
 * Called automatically by Twilio's <Gather> action
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const callSid = (req.nextUrl.searchParams.get("callSid") || formData.get("CallSid") || "").toString();
    const conversationId = req.nextUrl.searchParams.get("conversationId") || "";
    const speechResult = (formData.get("SpeechResult") || "").toString().trim();
    const from = formData.get("From")?.toString() || "";
    const to = formData.get("To")?.toString() || "";

    console.log("[Twilio] Response:", { callSid, conversationId, speechResult, from, to });
    console.log("[Twilio] All form data keys:", Array.from(formData.keys()));
    console.log("[Twilio] SpeechResult value:", formData.get("SpeechResult"));
    console.log("[Twilio] SpeechConfidence:", formData.get("SpeechConfidence"));

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
          console.warn("[Twilio Response] Using hardcoded fallback URL:", baseUrl);
        }
        
        // Remove trailing slashes and any whitespace/newlines
        baseUrl = baseUrl.replace(/\/+$/, "").trim().replace(/\s+/g, "");
        
        console.log("[Twilio Response] Using base URL:", baseUrl);
        console.log("[Twilio Response] Base URL JSON:", JSON.stringify(baseUrl));

    // Load conversation
    const { data: conversation } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

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

    // If no speech result, ask again
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
      
      // Ensure baseUrl doesn't have trailing slash and is clean
      const cleanBaseUrl = baseUrl.trim().replace(/\/+$/, "").replace(/\s+/g, "");
      const actionUrl = `${cleanBaseUrl}/api/twilio/response?callSid=${encodeURIComponent(callSid)}&conversationId=${encodeURIComponent(conversationId)}`;
      
      console.log("[Twilio Response] Constructed action URL:", actionUrl);
      console.log("[Twilio Response] Action URL JSON:", JSON.stringify(actionUrl));
      
      // Validate URL before using
      try {
        const testUrl = new URL(actionUrl);
        console.log("[Twilio Response] URL validation passed:", testUrl.href);
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
      console.log("[Twilio Response] Clean action URL:", cleanActionUrl);
      console.log("[Twilio Response] Escaped action URL:", escapedAction);
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" method="POST" speechTimeout="auto" language="en-US" action="${escapedAction}">
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

    await supabaseAdmin
      .from("conversations")
      .update({ transcript })
      .eq("id", conversationId);

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
    const result = await executor.executeNextStep(speechResult);

    if (!result.success) {
      // Log detailed error information
      console.error("[Twilio Response] Agent execution failed:", {
        conversationId,
        callSid,
        error: result.error,
        stepId: context.currentStepId,
        agentId: context.agentId,
        scenarioId: context.scenarioId,
        speechResult,
        gatheredData: context.gatheredData,
      });
      
      // Store error in conversation transcript for debugging
      const errorTranscript = [
        ...transcript,
        {
          role: "system",
          content: `ERROR: ${result.error || "Unknown error"}`,
          timestamp: new Date().toISOString(),
        },
      ];
      
      await supabaseAdmin
        .from("conversations")
        .update({ 
          transcript: errorTranscript,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
      
      // In development, include error details in the spoken message
      const isDev = process.env.NODE_ENV === 'development';
      const errorMessage = isDev 
        ? `Error occurred: ${result.error || "Unknown error"}. Check server logs for details.`
        : "I'm sorry, I encountered an error. Please try again.";
      
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${xmlEscape(errorMessage)}</Say>
  <Hangup/>
</Response>`;
      return new NextResponse(errorTwiml, {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    // Update conversation
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
      .eq("id", conversationId);

    // Generate TwiML response
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
    
    // Ensure baseUrl doesn't have trailing slash and is clean
    const cleanBaseUrl = baseUrl.trim().replace(/\/+$/, "").replace(/\s+/g, "");
    const responseUrl = `${cleanBaseUrl}/api/twilio/response?callSid=${encodeURIComponent(callSid)}&conversationId=${encodeURIComponent(conversationId)}`;
    
    console.log("[Twilio Response] Constructed response URL:", responseUrl);
    console.log("[Twilio Response] Response URL JSON:", JSON.stringify(responseUrl));
    
    // Validate URL before using
    try {
      const testUrl = new URL(responseUrl);
      console.log("[Twilio Response] URL validation passed:", testUrl.href);
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
    
    // Clean the URL one more time before escaping (remove any whitespace/newlines)
    const cleanResponseUrl = responseUrl.trim().replace(/\s+/g, "").replace(/\n/g, "").replace(/\r/g, "");
    const escapedResponseUrl = xmlEscapeAttr(cleanResponseUrl);
    console.log("[Twilio Response] Clean response URL:", cleanResponseUrl);
    console.log("[Twilio Response] Escaped response URL:", escapedResponseUrl);

    if (!result.shouldContinue) {
      // End conversation - only say something if there's configured output
      const hasOutput = result.output && result.output.trim().length > 0;
      let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>`;
      
      if (hasOutput) {
        const escapedOutput = xmlEscape(result.output);
        twiml += `
  <Say voice="alice">${escapedOutput}</Say>`;
      }
      
      twiml += `
  <Hangup/>
</Response>`;
      
      return new NextResponse(twiml, {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Continue conversation
    // Only include <Say> if there's actual output to speak
    const hasOutput = result.output && result.output.trim().length > 0;
    const escapedOutput = hasOutput ? xmlEscape(result.output) : "";
    
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>`;
    
    if (hasOutput) {
      twiml += `
  <Say voice="alice">${escapedOutput}</Say>
  <Pause length="1"/>`;
    }
    
    twiml += `
  <Gather input="speech" method="POST" speechTimeout="auto" language="en-US" action="${escapedResponseUrl}">
  </Gather>
  <Redirect>${escapedResponseUrl}</Redirect>
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  } catch (error: any) {
    console.error("[Twilio] Response error:", {
      error: error.message,
      stack: error.stack,
      callSid,
      conversationId,
      fullError: error,
    });
    
    // Store error in conversation if we have a conversationId
    if (conversationId) {
      try {
        const { data: conversation } = await supabaseAdmin
          .from("conversations")
          .select("transcript")
          .eq("id", conversationId)
          .single();
        
        if (conversation) {
          const errorTranscript = [
            ...(conversation.transcript || []),
            {
              role: "system",
              content: `SYSTEM ERROR: ${error.message || "Unknown error"}`,
              timestamp: new Date().toISOString(),
            },
          ];
          
          await supabaseAdmin
            .from("conversations")
            .update({ 
              transcript: errorTranscript,
              updated_at: new Date().toISOString(),
            })
            .eq("id", conversationId);
        }
      } catch (dbError) {
        console.error("[Twilio] Failed to store error in conversation:", dbError);
      }
    }
    
    const isDev = process.env.NODE_ENV === 'development';
    const errorMessage = isDev 
      ? `System error: ${error.message || "Unknown error"}. Check server logs.`
      : "Sorry, we're experiencing technical difficulties. Please try again later.";
    
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${xmlEscape(errorMessage)}</Say>
  <Hangup/>
</Response>`;
    return new NextResponse(errorTwiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}

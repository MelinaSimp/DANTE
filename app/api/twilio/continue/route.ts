import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { executeStep, ExecutionContext } from "@/lib/conversation/stepExecutor";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * Continue conversation - execute next step
 * GET /api/twilio/continue?conversationId=xxx&stepId=xxx
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const conversationId = searchParams.get("conversationId");
    const stepId = searchParams.get("stepId");
    const scenarioId = searchParams.get("scenarioId");

    if (!conversationId) {
      return new NextResponse(
        generateErrorTwiML("Missing conversation ID"),
        { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } }
      );
    }

    // Get conversation
    const { data: conversation, error: convError } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      console.error("[Twilio Continue] Conversation not found:", convError);
      return new NextResponse(
        generateErrorTwiML("Conversation not found"),
        { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } }
      );
    }

    // Get base URL
    let baseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "";
    if (!baseUrl && process.env.VERCEL_URL) {
      baseUrl = process.env.VERCEL_URL.startsWith("http")
        ? process.env.VERCEL_URL
        : `https://${process.env.VERCEL_URL}`;
    }
    if (!baseUrl) {
      const protocol = req.headers.get("x-forwarded-proto") || "https";
      const host = req.headers.get("host") || req.nextUrl.host;
      baseUrl = host ? `${protocol}://${host}` : "https://driftai.studio";
    }
    baseUrl = baseUrl.replace(/\/+$/, "").trim();

    // Determine which step to execute
    let targetStepId = stepId || conversation.current_step_id;
    let targetScenarioId = scenarioId || conversation.current_scenario_id;

    // If scenario changed, get first step of new scenario
    if (scenarioId && scenarioId !== conversation.current_scenario_id) {
      const { data: firstStep } = await supabaseAdmin
        .from("steps")
        .select("id")
        .eq("scenario_id", scenarioId)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      
      if (firstStep) {
        targetStepId = firstStep.id;
      }
    }

    if (!targetStepId) {
      // No more steps - end conversation
      await supabaseAdmin
        .from("conversations")
        .update({
          status: "completed",
          current_step_id: null,
        })
        .eq("id", conversationId);

      return new NextResponse(
        generateTwiML([
          { type: "say", message: "Thank you for calling. Goodbye." },
          { type: "hangup" },
        ]),
        { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } }
      );
    }

    // Get step
    const { data: step, error: stepError } = await supabaseAdmin
      .from("steps")
      .select("*")
      .eq("id", targetStepId)
      .single();

    if (stepError || !step) {
      console.error("[Twilio Continue] Step not found:", stepError);
      return new NextResponse(
        generateErrorTwiML("Step not found"),
        { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } }
      );
    }

    // Create execution context
    const context: ExecutionContext = {
      conversationId: conversation.id,
      agentId: conversation.agent_id,
      scenarioId: targetScenarioId || conversation.current_scenario_id || "",
      currentStepId: targetStepId,
      gatheredData: conversation.gathered_data || {},
      conversationState: conversation.conversation_state || {},
      baseUrl,
    };

    // Execute step
    const result = await executeStep(step, context);

    // Update conversation state
    const updates: any = {
      current_step_id: result.nextStepId || null,
      current_scenario_id: result.nextScenarioId || targetScenarioId || conversation.current_scenario_id,
      updated_at: new Date().toISOString(),
    };

    if (result.gatheredData) {
      updates.gathered_data = { ...conversation.gathered_data, ...result.gatheredData };
    }

    if (result.shouldEnd) {
      updates.status = "completed";
    }

    await supabaseAdmin
      .from("conversations")
      .update(updates)
      .eq("id", conversationId);

    return new NextResponse(result.twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  } catch (error: any) {
    console.error("[Twilio Continue] Error:", error);
    return new NextResponse(
      generateErrorTwiML("An error occurred"),
      { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } }
    );
  }
}

function generateTwiML(actions: Array<{ type: string; [key: string]: any }>): string {
  let twiml = '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n';
  
  for (const action of actions) {
    switch (action.type) {
      case "say":
        twiml += `  <Say voice="alice">${escapeXml(action.message)}</Say>\n`;
        break;
      case "redirect":
        twiml += `  <Redirect>${escapeXml(action.url)}</Redirect>\n`;
        break;
      case "hangup":
        twiml += `  <Hangup/>\n`;
        break;
    }
  }
  
  twiml += "</Response>";
  return twiml;
}

function generateErrorTwiML(message: string): string {
  return generateTwiML([
    { type: "say", message },
    { type: "hangup" },
  ]);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}






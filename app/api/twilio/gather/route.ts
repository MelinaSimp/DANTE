import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { executeStep, ExecutionContext } from "@/lib/conversation/stepExecutor";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * Handle Gather input from customer
 * POST /api/twilio/gather?conversationId=xxx&stepId=xxx
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const conversationId = searchParams.get("conversationId");
    const stepId = searchParams.get("stepId");

    if (!conversationId || !stepId) {
      return new NextResponse(
        generateErrorTwiML("Missing parameters"),
        { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } }
      );
    }

    // Get form data from Twilio
    const formData = await req.formData();
    const speechResult = formData.get("SpeechResult")?.toString() || "";
    const digits = formData.get("Digits")?.toString() || "";

    const input = speechResult || digits;

    console.log("[Twilio Gather] Received input:", input);
    console.log("[Twilio Gather] Conversation ID:", conversationId);
    console.log("[Twilio Gather] Step ID:", stepId);

    // Get conversation
    const { data: conversation, error: convError } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      console.error("[Twilio Gather] Conversation not found:", convError);
      return new NextResponse(
        generateErrorTwiML("Conversation not found"),
        { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } }
      );
    }

    // Update conversation with gathered data
    const gatheredData = {
      ...(conversation.gathered_data || {}),
      lastInput: input,
      [`step_${stepId}`]: input,
    };

    const conversationState = {
      ...(conversation.conversation_state || {}),
      lastGatherInput: input,
    };

    await supabaseAdmin
      .from("conversations")
      .update({
        gathered_data: gatheredData,
        conversation_state: conversationState,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

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

    // Get current step
    const { data: step, error: stepError } = await supabaseAdmin
      .from("steps")
      .select("*")
      .eq("id", stepId)
      .single();

    if (stepError || !step) {
      console.error("[Twilio Gather] Step not found:", stepError);
      return new NextResponse(
        generateErrorTwiML("Step not found"),
        { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } }
      );
    }

    // Create execution context with updated gathered data
    const context: ExecutionContext = {
      conversationId: conversation.id,
      agentId: conversation.agent_id,
      scenarioId: conversation.current_scenario_id || "",
      currentStepId: stepId,
      gatheredData,
      conversationState,
      baseUrl,
    };

    // Determine next step based on branches
    const { data: branches } = await supabaseAdmin
      .from("step_branches")
      .select("*")
      .eq("step_id", stepId)
      .order("created_at", { ascending: true });

    let nextStepId: string | undefined;

    // Try to match a branch based on input
    if (branches && branches.length > 0) {
      const inputLower = input.toLowerCase();
      for (const branch of branches) {
        const conditionLower = (branch.condition || "").toLowerCase();
        if (inputLower.includes(conditionLower) || 
            (branch.condition_tag && inputLower.includes(branch.condition_tag.replace("@", "").toLowerCase()))) {
          nextStepId = branch.next_step_id || undefined;
          break;
        }
      }
    }

    // If no branch matched, get next step by sort_order
    if (!nextStepId) {
      const { data: currentStep } = await supabaseAdmin
        .from("steps")
        .select("sort_order, scenario_id")
        .eq("id", stepId)
        .single();

      if (currentStep) {
        const { data: nextStep } = await supabaseAdmin
          .from("steps")
          .select("id")
          .eq("scenario_id", currentStep.scenario_id)
          .gt("sort_order", currentStep.sort_order || 0)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();

        nextStepId = nextStep?.id;
      }
    }

    // Update conversation with next step
    await supabaseAdmin
      .from("conversations")
      .update({
        current_step_id: nextStepId || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    // Continue to next step
    if (nextStepId) {
      return new NextResponse(
        generateRedirectTwiML(`${baseUrl}/api/twilio/continue?conversationId=${conversationId}&stepId=${nextStepId}`),
        { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } }
      );
    } else {
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
  } catch (error: any) {
    console.error("[Twilio Gather] Error:", error);
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

function generateRedirectTwiML(url: string): string {
  return generateTwiML([{ type: "redirect", url }]);
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





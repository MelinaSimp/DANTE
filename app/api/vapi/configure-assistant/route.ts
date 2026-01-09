import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Configure Vapi Assistant
 * POST /api/vapi/configure-assistant
 * 
 * This endpoint uses the Vapi API to automatically configure an assistant
 * to use our webhook instead of Vapi's default model responses.
 * 
 * Body:
 * {
 *   assistantId: string (required) - The Vapi assistant ID
 *   serverUrl: string (optional) - The webhook URL (defaults to current domain)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const vapiApiKey = process.env.VAPI_API_KEY;
    if (!vapiApiKey) {
      return NextResponse.json(
        { error: "VAPI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { assistantId, serverUrl } = body;

    if (!assistantId) {
      return NextResponse.json(
        { error: "assistantId is required" },
        { status: 400 }
      );
    }

    // Default server URL to current domain
    // Try to get from request headers first, then environment, then fallback
    let webhookUrl = serverUrl;
    
    if (!webhookUrl) {
      // Try to get from request origin (current deployment)
      const origin = req.headers.get("origin") || req.headers.get("host");
      if (origin && !origin.includes("localhost")) {
        webhookUrl = `https://${origin.replace(/^https?:\/\//, "")}/api/vapi/webhook`;
      } else {
        // Use environment variables or fallback
        webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://drift-k6yfyzx15-drift4.vercel.app"}/api/vapi/webhook`;
      }
    }

    // Get current assistant configuration
    const getResponse = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${vapiApiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      console.error("[Vapi] Failed to get assistant:", errorText);
      return NextResponse.json(
        { error: `Failed to get assistant: ${errorText}` },
        { status: getResponse.status }
      );
    }

    const currentAssistant = await getResponse.json();
    console.log("[Vapi] Current assistant config:", JSON.stringify(currentAssistant, null, 2));

    // Update assistant configuration to use Server URL
    // Set model to null to force Server URL mode (this is the key!)
    const updatePayload: any = {
      // Keep existing voice settings (ElevenLabs)
      voice: currentAssistant.voice || {},
      
      // CRITICAL: Set model to null to force Server URL mode
      // This ensures Vapi ONLY uses our webhook, not built-in LLM
      model: null,
      
      // Set Server URL
      serverUrl: webhookUrl,
      
      // Clear first message (we'll handle it via webhook)
      firstMessage: "",
      
      // Keep other settings
      name: currentAssistant.name,
      voicemailMessage: currentAssistant.voicemailMessage || "Please call back when you're available.",
      endCallMessage: currentAssistant.endCallMessage || "Goodbye.",
      transcriber: currentAssistant.transcriber || {},
      firstMessageMode: currentAssistant.firstMessageMode || "assistant-speaks-first",
    };

    console.log("[Vapi] Updating assistant with payload:", JSON.stringify(updatePayload, null, 2));

    // Update assistant
    const updateResponse = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${vapiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updatePayload),
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error("[Vapi] Failed to update assistant:", errorText);
      return NextResponse.json(
        { error: `Failed to update assistant: ${errorText}` },
        { status: updateResponse.status }
      );
    }

    const updatedAssistant = await updateResponse.json();
    console.log("[Vapi] Assistant updated successfully:", updatedAssistant.id);

    return NextResponse.json({
      success: true,
      message: "Assistant configured successfully",
      assistant: {
        id: updatedAssistant.id,
        name: updatedAssistant.name,
        serverUrl: updatedAssistant.serverUrl,
        model: updatedAssistant.model,
      },
    });
  } catch (error: any) {
    console.error("[Vapi] Configuration error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

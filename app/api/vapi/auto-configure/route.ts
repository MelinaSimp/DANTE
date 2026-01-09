import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Auto-Configure Vapi Assistant
 * GET /api/vapi/auto-configure
 * 
 * This endpoint automatically:
 * 1. Lists your Vapi assistants
 * 2. Configures the first one (or specified one) with your webhook
 * 3. Sets model to null (Server URL mode)
 * 4. Configures ElevenLabs voice
 */
export async function GET(req: NextRequest) {
  try {
    const vapiApiKey = process.env.VAPI_API_KEY;
    if (!vapiApiKey) {
      return NextResponse.json(
        { error: "VAPI_API_KEY not configured in Vercel environment variables" },
        { status: 500 }
      );
    }

    // Get production URL from request
    const origin = req.headers.get("origin") || req.headers.get("host");
    const productionUrl = origin && !origin.includes("localhost")
      ? `https://${origin.replace(/^https?:\/\//, "")}`
      : process.env.NEXT_PUBLIC_APP_URL || 
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
        "https://drift-k6yfyzx15-drift4.vercel.app";

    const webhookUrl = `${productionUrl}/api/vapi/webhook`;

    console.log("[Vapi Auto-Configure] Starting configuration...");
    console.log("[Vapi Auto-Configure] Webhook URL:", webhookUrl);
    console.log("[Vapi Auto-Configure] Production URL:", productionUrl);

    // Step 1: List assistants
    console.log("[Vapi Auto-Configure] Listing assistants...");
    const listResponse = await fetch("https://api.vapi.ai/assistant", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${vapiApiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      console.error("[Vapi Auto-Configure] Failed to list assistants:", errorText);
      return NextResponse.json(
        { error: `Failed to list assistants: ${errorText}` },
        { status: listResponse.status }
      );
    }

    const assistants = await listResponse.json();
    
    if (!assistants || assistants.length === 0) {
      return NextResponse.json(
        { 
          error: "No assistants found. Please create one in Vapi dashboard first.",
          instructions: "Go to https://dashboard.vapi.ai and create an assistant, then run this again."
        },
        { status: 404 }
      );
    }

    console.log(`[Vapi Auto-Configure] Found ${assistants.length} assistant(s)`);
    
    // Use first assistant
    const assistantId = assistants[0].id;
    const assistantName = assistants[0].name;
    
    console.log(`[Vapi Auto-Configure] Using assistant: ${assistantName} (${assistantId})`);

    // Step 2: Get current configuration
    console.log("[Vapi Auto-Configure] Fetching current configuration...");
    const getResponse = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${vapiApiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      console.error("[Vapi Auto-Configure] Failed to get assistant:", errorText);
      return NextResponse.json(
        { error: `Failed to get assistant: ${errorText}` },
        { status: getResponse.status }
      );
    }

    const currentAssistant = await getResponse.json();
    console.log("[Vapi Auto-Configure] Current voice:", currentAssistant.voice?.voiceId);

    // Step 3: Configure assistant
    console.log("[Vapi Auto-Configure] Configuring assistant...");
    
    const updatePayload: any = {
      // Keep existing voice settings (ElevenLabs) or use defaults
      voice: currentAssistant.voice || {
        provider: "11labs",
        voiceId: "cgSgspJ2msm6clMCkdW9", // Default voice
        model: "eleven_turbo_v2_5",
        stability: 0.5,
        similarityBoost: 0.75,
      },
      
      // CRITICAL: Set model to null to force Server URL mode
      model: null,
      
      // Set Server URL
      serverUrl: webhookUrl,
      
      // Clear first message (we'll handle it via webhook)
      firstMessage: "",
      
      // Keep other settings
      name: currentAssistant.name || "Drift AI Receptionist",
      voicemailMessage: currentAssistant.voicemailMessage || "Please call back when you're available.",
      endCallMessage: currentAssistant.endCallMessage || "Goodbye.",
      transcriber: currentAssistant.transcriber || {
        provider: "deepgram",
        model: "nova-2",
        language: "en",
      },
      firstMessageMode: currentAssistant.firstMessageMode || "assistant-speaks-first",
    };

    console.log("[Vapi Auto-Configure] Update payload:", JSON.stringify(updatePayload, null, 2));

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
      console.error("[Vapi Auto-Configure] Failed to update assistant:", errorText);
      return NextResponse.json(
        { error: `Failed to update assistant: ${errorText}` },
        { status: updateResponse.status }
      );
    }

    const updatedAssistant = await updateResponse.json();
    console.log("[Vapi Auto-Configure] Assistant configured successfully!");

    // Step 4: Check and update phone number if needed
    let phoneNumberInfo = null;
    try {
      const phoneNumbersResponse = await fetch("https://api.vapi.ai/phone-number", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${vapiApiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (phoneNumbersResponse.ok) {
        const phoneNumbers = await phoneNumbersResponse.json();
        const linkedNumber = Array.isArray(phoneNumbers) 
          ? phoneNumbers.find((pn: any) => pn.assistantId === assistantId)
          : phoneNumbers;

        if (linkedNumber) {
          phoneNumberInfo = {
            id: linkedNumber.id,
            number: linkedNumber.number || linkedNumber.id,
            serverUrl: linkedNumber.server?.url,
          };

          // Update phone number server URL if different
          if (linkedNumber.server?.url !== webhookUrl) {
            console.log("[Vapi Auto-Configure] Updating phone number server URL...");
            const updatePhoneResponse = await fetch(`https://api.vapi.ai/phone-number/${linkedNumber.id}`, {
              method: "PATCH",
              headers: {
                "Authorization": `Bearer ${vapiApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                server: {
                  url: webhookUrl,
                  timeoutSeconds: 20,
                },
              }),
            });

            if (updatePhoneResponse.ok) {
              console.log("[Vapi Auto-Configure] Phone number server URL updated");
              const updatedPhone = await updatePhoneResponse.json();
              phoneNumberInfo.serverUrl = updatedPhone.server?.url;
            } else {
              const errorText = await updatePhoneResponse.text();
              console.warn("[Vapi Auto-Configure] Could not update phone number server URL:", errorText);
            }
          }
        }
      }
    } catch (phoneError) {
      console.warn("[Vapi Auto-Configure] Could not check phone numbers:", phoneError);
    }

    return NextResponse.json({
      success: true,
      message: "Assistant configured successfully!",
      assistant: {
        id: updatedAssistant.id,
        name: updatedAssistant.name,
        serverUrl: updatedAssistant.serverUrl,
        model: updatedAssistant.model,
        voice: updatedAssistant.voice,
        firstMessageMode: updatedAssistant.firstMessageMode,
      },
      phoneNumber: phoneNumberInfo,
      webhookUrl,
      nextSteps: [
        "Make a call to your Vapi phone number",
        "Check Vercel logs for [Vapi] entries",
        "Verify scenarios are working",
      ],
    });
  } catch (error: any) {
    console.error("[Vapi Auto-Configure] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

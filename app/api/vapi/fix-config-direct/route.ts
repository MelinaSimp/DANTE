import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Direct Vapi Fix - Uses API key from request body instead of env var
 * POST /api/vapi/fix-config-direct
 * 
 * Body: { vapiApiKey: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const vapiApiKey = body.vapiApiKey || process.env.VAPI_API_KEY;
    
    if (!vapiApiKey) {
      return NextResponse.json(
        { error: "VAPI_API_KEY is required. Provide it in request body or set as environment variable." },
        { status: 400 }
      );
    }

    // Get production URL
    const origin = req.headers.get("origin") || req.headers.get("host");
    const productionUrl = origin && !origin.includes("localhost")
      ? `https://${origin.replace(/^https?:\/\//, "")}`
      : process.env.NEXT_PUBLIC_APP_URL || 
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
        "https://drift-dl7zwy7hn-drift4.vercel.app";

    const webhookUrl = `${productionUrl}/api/vapi/webhook`;

    console.log("[Vapi Fix Direct] Starting...");
    console.log("[Vapi Fix Direct] Webhook URL:", webhookUrl);

    // Step 1: List assistants
    const listResponse = await fetch("https://api.vapi.ai/assistant", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${vapiApiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      return NextResponse.json(
        { error: `Failed to list assistants: ${errorText}` },
        { status: listResponse.status }
      );
    }

    const assistantsData = await listResponse.json();
    const assistants = Array.isArray(assistantsData) ? assistantsData : (assistantsData.data || [assistantsData]);
    
    if (!assistants || assistants.length === 0) {
      return NextResponse.json(
        { error: "No assistants found. Create one in Vapi dashboard first." },
        { status: 404 }
      );
    }

    const assistantId = assistants[0].id || assistants[0].assistantId;
    if (!assistantId) {
      return NextResponse.json(
        { error: "Could not extract assistant ID", assistantsData },
        { status: 500 }
      );
    }

    // Step 2: Get current configuration
    const getResponse = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${vapiApiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      return NextResponse.json(
        { error: `Failed to get assistant: ${errorText}` },
        { status: getResponse.status }
      );
    }

    const currentAssistant = await getResponse.json();

    // Step 3: Build fixed configuration
    const fixedConfig: any = {
      voice: currentAssistant.voice || {
        provider: "11labs",
        voiceId: "cgSgspJ2msm6clMCkdW9",
        model: "eleven_turbo_v2_5",
        stability: 0.5,
        similarityBoost: 0.75,
      },
      model: null,
      serverUrl: webhookUrl,
      firstMessage: "",
      firstMessageMode: "assistant-speaks-first",
      name: currentAssistant.name || "Drift AI Receptionist",
      voicemailMessage: currentAssistant.voicemailMessage || "Please call back when you're available.",
      endCallMessage: currentAssistant.endCallMessage || "Goodbye.",
      transcriber: currentAssistant.transcriber || {
        provider: "deepgram",
        model: "nova-2",
        language: "en",
      },
    };

    // Step 4: Update assistant
    const updateResponse = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${vapiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fixedConfig),
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      return NextResponse.json(
        { error: `Failed to update assistant: ${errorText}` },
        { status: updateResponse.status }
      );
    }

    const updatedAssistant = await updateResponse.json();

    // Step 5: Fix phone number
    let phoneNumberInfo = null;
    try {
      const phoneResponse = await fetch("https://api.vapi.ai/phone-number", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${vapiApiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (phoneResponse.ok) {
        const phoneNumbersData = await phoneResponse.json();
        const phoneNumbers = Array.isArray(phoneNumbersData) 
          ? phoneNumbersData 
          : (phoneNumbersData.data || [phoneNumbersData]);
        const linkedNumber = phoneNumbers.find((pn: any) => 
          pn.assistantId === assistantId || pn.assistant?.id === assistantId
        );

        if (linkedNumber && linkedNumber.server?.url !== webhookUrl) {
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
            phoneNumberInfo = { updated: true, number: linkedNumber.number || linkedNumber.id };
          }
        } else if (linkedNumber) {
          phoneNumberInfo = { updated: false, number: linkedNumber.number || linkedNumber.id, alreadyCorrect: true };
        }
      }
    } catch (error: any) {
      console.warn("[Vapi Fix Direct] Could not check phone numbers:", error.message);
    }

    return NextResponse.json({
      success: true,
      message: "Configuration fixed successfully!",
      assistant: {
        id: updatedAssistant.id,
        name: updatedAssistant.name,
        model: updatedAssistant.model,
        serverUrl: updatedAssistant.serverUrl,
        firstMessage: updatedAssistant.firstMessage || "(empty)",
        firstMessageMode: updatedAssistant.firstMessageMode,
      },
      phoneNumber: phoneNumberInfo,
      webhookUrl,
      nextSteps: [
        "Make a test call to your Vapi phone number",
        "Check Vercel logs for [Vapi] entries",
        "You should see: request-start, user messages, and responses",
      ],
    });
  } catch (error: any) {
    console.error("[Vapi Fix Direct] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Auto-Fix Vapi Configuration
 * GET /api/vapi/fix-config
 * 
 * This endpoint automatically diagnoses and fixes Vapi configuration issues
 */
export async function GET(req: NextRequest) {
  try {
    const vapiApiKey = process.env.VAPI_API_KEY;
    console.log("[Vapi Fix] VAPI_API_KEY check:", {
      exists: !!vapiApiKey,
      length: vapiApiKey?.length || 0,
      prefix: vapiApiKey?.substring(0, 10) || "N/A",
    });
    
    if (!vapiApiKey) {
      return NextResponse.json(
        { 
          error: "VAPI_API_KEY not configured in Vercel environment variables",
          hint: "Make sure VAPI_API_KEY is set for Production environment and redeploy"
        },
        { status: 500 }
      );
    }

    // Get production URL
    const origin = req.headers.get("origin") || req.headers.get("host");
    const productionUrl = origin && !origin.includes("localhost")
      ? `https://${origin.replace(/^https?:\/\//, "")}`
      : process.env.NEXT_PUBLIC_APP_URL || 
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
        "https://drift-8wxgu825o-drift4.vercel.app";

    const webhookUrl = `${productionUrl}/api/vapi/webhook`;

    console.log("[Vapi Fix] Starting diagnosis and fix...");
    console.log("[Vapi Fix] Webhook URL:", webhookUrl);

    const diagnosis: any = {
      assistantId: null,
      issues: [],
      warnings: [],
      fixes: [],
      results: {},
    };

    // Step 1: List assistants
    console.log("[Vapi Fix] Fetching assistants...");
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
    
    // Handle both array and object responses from Vapi
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
        { error: "Could not extract assistant ID from response", assistantsData },
        { status: 500 }
      );
    }
    diagnosis.assistantId = assistantId;
    console.log(`[Vapi Fix] Using assistant: ${assistants[0].name} (${assistantId})`);

    // Step 2: Get current configuration
    console.log("[Vapi Fix] Fetching current configuration...");
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
    console.log("[Vapi Fix] Current config:", {
      model: currentAssistant.model,
      serverUrl: currentAssistant.serverUrl,
      firstMessage: currentAssistant.firstMessage,
      firstMessageMode: currentAssistant.firstMessageMode,
    });

    // Step 3: Diagnose issues
    if (currentAssistant.model !== null) {
      diagnosis.issues.push("Model is not null - will prevent Server URL mode");
    } else {
      diagnosis.results.model = "✅ Model is null (correct)";
    }

    if (currentAssistant.serverUrl !== webhookUrl) {
      diagnosis.warnings.push(`Server URL mismatch: ${currentAssistant.serverUrl} vs ${webhookUrl}`);
    } else {
      diagnosis.results.serverUrl = "✅ Server URL is correct";
    }

    if (currentAssistant.firstMessage && currentAssistant.firstMessage.trim() !== "") {
      diagnosis.warnings.push("First message is set - should be empty for Server URL mode");
    } else {
      diagnosis.results.firstMessage = "✅ First message is empty (correct)";
    }

    if (currentAssistant.firstMessageMode !== "assistant-speaks-first") {
      diagnosis.warnings.push(`First message mode is: ${currentAssistant.firstMessageMode} (should be 'assistant-speaks-first')`);
    } else {
      diagnosis.results.firstMessageMode = "✅ First message mode is correct";
    }

    // Step 4: Build fixed configuration
    console.log("[Vapi Fix] Building fixed configuration...");
    
    const fixedConfig: any = {
      voice: currentAssistant.voice || {
        provider: "11labs",
        voiceId: "cgSgspJ2msm6clMCkdW9",
        model: "eleven_turbo_v2_5",
        stability: 0.5,
        similarityBoost: 0.75,
      },
      model: null, // CRITICAL: Force Server URL mode
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

    // Step 5: Apply fixes
    console.log("[Vapi Fix] Applying fixes...");
    
    if (currentAssistant.model !== null) {
      diagnosis.fixes.push("Setting model to null (Server URL mode)");
    }
    
    if (currentAssistant.serverUrl !== webhookUrl) {
      diagnosis.fixes.push(`Updating Server URL to: ${webhookUrl}`);
    }
    
    if (currentAssistant.firstMessage && currentAssistant.firstMessage.trim() !== "") {
      diagnosis.fixes.push("Clearing first message");
    }
    
    if (currentAssistant.firstMessageMode !== "assistant-speaks-first") {
      diagnosis.fixes.push("Setting first message mode to 'assistant-speaks-first'");
    }

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
        { 
          error: `Failed to update assistant: ${errorText}`,
          diagnosis,
        },
        { status: updateResponse.status }
      );
    }

    const updatedAssistant = await updateResponse.json();
    console.log("[Vapi Fix] Assistant updated successfully");

    // Step 6: Fix phone number
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

        if (linkedNumber) {
          phoneNumberInfo = {
            id: linkedNumber.id,
            number: linkedNumber.number || linkedNumber.id,
            currentServerUrl: linkedNumber.server?.url,
            needsUpdate: linkedNumber.server?.url !== webhookUrl,
          };

          if (phoneNumberInfo.needsUpdate) {
            console.log("[Vapi Fix] Updating phone number Server URL...");
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
              diagnosis.fixes.push(`Updated phone number Server URL to: ${webhookUrl}`);
              phoneNumberInfo.updated = true;
            } else {
              const errorText = await updatePhoneResponse.text();
              diagnosis.warnings.push(`Could not update phone number Server URL: ${errorText}`);
              phoneNumberInfo.updated = false;
            }
          } else {
            diagnosis.results.phoneNumber = "✅ Phone number Server URL is correct";
          }
        } else {
          diagnosis.warnings.push("No phone number linked to this assistant");
        }
      }
    } catch (error: any) {
      diagnosis.warnings.push(`Could not check phone numbers: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      message: "Configuration fixed successfully!",
      diagnosis: {
        assistantId,
        assistantName: updatedAssistant.name,
        issues: diagnosis.issues.length > 0 ? diagnosis.issues : ["None"],
        warnings: diagnosis.warnings.length > 0 ? diagnosis.warnings : ["None"],
        fixes: diagnosis.fixes.length > 0 ? diagnosis.fixes : ["No changes needed"],
        results: diagnosis.results,
        phoneNumber: phoneNumberInfo,
      },
      configuration: {
        model: updatedAssistant.model,
        serverUrl: updatedAssistant.serverUrl,
        firstMessage: updatedAssistant.firstMessage || "(empty)",
        firstMessageMode: updatedAssistant.firstMessageMode,
        voice: updatedAssistant.voice,
      },
      webhookUrl,
      nextSteps: [
        "Make a test call to your Vapi phone number",
        "Check Vercel logs for [Vapi] entries",
        "You should see: request-start, user messages, and responses",
        "If you only see end-of-call-report, check Vapi dashboard for additional settings",
      ],
    });
  } catch (error: any) {
    console.error("[Vapi Fix] Error:", error);
    console.error("[Vapi Fix] Error stack:", error.stack);
    return NextResponse.json(
      { 
        error: error.message || "Internal server error",
        details: process.env.NODE_ENV === "development" ? error.stack : undefined,
        vapiApiKeySet: !!process.env.VAPI_API_KEY,
        vapiApiKeyLength: process.env.VAPI_API_KEY?.length || 0,
      },
      { status: 500 }
    );
  }
}

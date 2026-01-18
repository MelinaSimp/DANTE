#!/usr/bin/env node

/**
 * Configure Vapi Assistant Script
 * 
 * This script directly calls the Vapi API to configure your assistant.
 * 
 * Usage:
 *   VAPI_API_KEY=your_key node scripts/configure-vapi.js <assistantId> [serverUrl]
 * 
 * Example:
 *   VAPI_API_KEY=your_key node scripts/configure-vapi.js 67b7fd78-da19-409e-9fd9-c87edf19c3eb
 */

const assistantId = process.argv[2];
const serverUrl = process.argv[3] || "https://drift-1et9oivry-drift4.vercel.app/api/vapi/webhook";
const vapiApiKey = process.env.VAPI_API_KEY;

if (!assistantId) {
  console.error("❌ Error: assistantId is required");
  console.log("\nUsage: VAPI_API_KEY=your_key node scripts/configure-vapi.js <assistantId> [serverUrl]");
  process.exit(1);
}

if (!vapiApiKey) {
  console.error("❌ Error: VAPI_API_KEY environment variable is required");
  console.log("\nUsage: VAPI_API_KEY=your_key node scripts/configure-vapi.js <assistantId> [serverUrl]");
  process.exit(1);
}

async function configureAssistant() {
  try {
    console.log("🔧 Configuring Vapi Assistant...");
    console.log(`   Assistant ID: ${assistantId}`);
    console.log(`   Server URL: ${serverUrl}\n`);

    // Get current assistant configuration
    console.log("📥 Fetching current assistant configuration...");
    const getResponse = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${vapiApiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      console.error("❌ Failed to get assistant:", errorText);
      process.exit(1);
    }

    const currentAssistant = await getResponse.json();
    console.log("✅ Got current configuration\n");

    // Update assistant configuration
    // Remove model messages entirely - this forces Vapi to use Server URL
    const updatePayload = {
      // Keep existing voice settings
      voice: currentAssistant.voice || {},
      
      // Keep existing model but remove all messages
      model: {
        ...(currentAssistant.model || {}),
        // Remove messages array entirely - this forces Vapi to use Server URL
        messages: [],
      },
      
      // Set Server URL
      serverUrl: serverUrl,
      
      // Clear first message (we'll handle it via webhook)
      firstMessage: "",
      
      // Keep other settings
      name: currentAssistant.name,
      voicemailMessage: currentAssistant.voicemailMessage || "Please call back when you're available.",
      endCallMessage: currentAssistant.endCallMessage || "Goodbye.",
      transcriber: currentAssistant.transcriber || {},
      // IMPORTANT: Set to "assistant-speaks-first" so Vapi calls Server URL for first message
      // This ensures our webhook is called when the call starts
      firstMessageMode: "assistant-speaks-first",
    };

    // Also update the phone number's server URL (in case it's different)
    console.log("📞 Checking phone number configuration...");
    const phoneNumbersResponse = await fetch(`https://api.vapi.ai/phone-number`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${vapiApiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (phoneNumbersResponse.ok) {
      const phoneNumbers = await phoneNumbersResponse.json();
      const phoneNumber = Array.isArray(phoneNumbers) 
        ? phoneNumbers.find(pn => pn.assistantId === assistantId)
        : phoneNumbers;
      
      if (phoneNumber && phoneNumber.server?.url !== serverUrl) {
        console.log(`📞 Updating phone number ${phoneNumber.id} server URL...`);
        const updatePhoneResponse = await fetch(`https://api.vapi.ai/phone-number/${phoneNumber.id}`, {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${vapiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            server: {
              url: serverUrl,
              timeoutSeconds: 20,
            },
          }),
        });
        
        if (updatePhoneResponse.ok) {
          console.log("✅ Phone number server URL updated");
        } else {
          const errorText = await updatePhoneResponse.text();
          console.warn("⚠️  Could not update phone number server URL:", errorText);
        }
      }
    }

    console.log("📤 Updating assistant configuration...");
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
      console.error("❌ Failed to update assistant:", errorText);
      process.exit(1);
    }

    const updatedAssistant = await updateResponse.json();
    console.log("✅ Assistant configured successfully!\n");
    console.log("Configuration:");
    console.log(`   Name: ${updatedAssistant.name}`);
    console.log(`   Server URL: ${updatedAssistant.serverUrl}`);
    console.log(`   Model Messages: ${JSON.stringify(updatedAssistant.model?.messages || [], null, 2)}`);
    console.log("\n✅ Your assistant is now configured to use your webhook!");
    console.log("   Test it by making a call to your phone number.");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

configureAssistant();

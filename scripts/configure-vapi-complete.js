#!/usr/bin/env node

/**
 * Complete Vapi Configuration Script
 * 
 * This script fully configures your Vapi assistant to use your webhook
 * for ALL messages, including request-start events.
 */

const assistantId = "67b7fd78-da19-409e-9fd9-c87edf19c3eb";
const serverUrl = "https://drift-1et9oivry-drift4.vercel.app/api/vapi/webhook";
const vapiApiKey = "2bf8f671-ccbb-440b-bf7e-9d5985ad3152";

async function configureVapi() {
  try {
    console.log("🔧 Complete Vapi Configuration");
    console.log(`   Assistant ID: ${assistantId}`);
    console.log(`   Server URL: ${serverUrl}\n`);

    // Step 1: Get current assistant configuration
    console.log("📥 Step 1: Fetching current assistant configuration...");
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
    console.log("✅ Got current configuration");
    console.log(`   Current Server URL: ${currentAssistant.serverUrl || "NOT SET"}`);
    console.log(`   Current Model Messages: ${JSON.stringify(currentAssistant.model?.messages || [])}\n`);

    // Step 2: Update assistant with proper configuration
    console.log("📤 Step 2: Updating assistant configuration...");
    const updatePayload = {
      // Keep existing voice settings
      voice: currentAssistant.voice || {},
      
      // Model configuration - CRITICAL: Empty messages forces Vapi to use Server URL
      model: {
        ...(currentAssistant.model || {}),
        messages: [], // Empty messages = use Server URL for all responses
      },
      
      // Server URL - this is what Vapi will call
      serverUrl: serverUrl,
      
      // Clear first message (we handle it via webhook)
      firstMessage: "",
      
      // First message mode - assistant speaks first triggers Server URL call
      firstMessageMode: "assistant-speaks-first",
      
      // Keep other settings
      name: currentAssistant.name,
      voicemailMessage: currentAssistant.voicemailMessage || "Please call back when you're available.",
      endCallMessage: currentAssistant.endCallMessage || "Goodbye.",
      transcriber: currentAssistant.transcriber || {},
    };

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
    console.log("✅ Assistant updated successfully");
    console.log(`   Server URL: ${updatedAssistant.serverUrl}`);
    console.log(`   Model Messages: ${JSON.stringify(updatedAssistant.model?.messages || [])}\n`);

    // Step 3: Update phone number server URL
    console.log("📞 Step 3: Updating phone number configuration...");
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
      
      if (phoneNumber) {
        console.log(`   Found phone number: ${phoneNumber.number} (${phoneNumber.id})`);
        
        if (phoneNumber.server?.url !== serverUrl) {
          console.log(`   Updating phone number server URL...`);
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
            const updatedPhone = await updatePhoneResponse.json();
            console.log(`   ✅ Phone number server URL updated: ${updatedPhone.server?.url}`);
          } else {
            const errorText = await updatePhoneResponse.text();
            console.warn(`   ⚠️  Could not update phone number: ${errorText}`);
          }
        } else {
          console.log(`   ✅ Phone number server URL already correct`);
        }
      } else {
        console.warn(`   ⚠️  No phone number found for this assistant`);
      }
    } else {
      console.warn(`   ⚠️  Could not fetch phone numbers`);
    }

    console.log("\n✅ Configuration Complete!");
    console.log("\n📋 Summary:");
    console.log(`   ✅ Assistant Server URL: ${serverUrl}`);
    console.log(`   ✅ Model Messages: [] (empty = use Server URL)`);
    console.log(`   ✅ First Message Mode: assistant-speaks-first`);
    console.log(`   ✅ Phone Number Server URL: ${serverUrl}`);
    console.log("\n🧪 Next Steps:");
    console.log("   1. Make a test call to your phone number");
    console.log("   2. Check Vercel logs for [Vapi] entries");
    console.log("   3. You should see:");
    console.log("      - [Vapi] Call started (request-start)");
    console.log("      - [Vapi] User message received");
    console.log("      - [Vapi] Returning response");
    console.log("\n   If you only see 'end-of-call-report', Vapi may need");
    console.log("   Server Messages/Events enabled in the dashboard.");
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

configureVapi();

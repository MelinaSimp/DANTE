#!/usr/bin/env node

/**
 * Fix Vapi Configuration
 * 
 * This script fixes common Vapi configuration issues to ensure Server URL mode works
 * 
 * Usage:
 *   VAPI_API_KEY=your_key node scripts/fix-vapi-config.js [assistantId]
 */

const vapiApiKey = process.env.VAPI_API_KEY;

if (!vapiApiKey) {
  console.error("❌ Error: VAPI_API_KEY environment variable is required");
  process.exit(1);
}

async function fixConfig() {
  try {
    console.log("🔧 Fixing Vapi Configuration...\n");

    // Get production URL
    const productionUrl = process.env.PRODUCTION_URL || 
                           process.env.NEXT_PUBLIC_APP_URL || 
                           "https://drift-8wxgu825o-drift4.vercel.app";
    const webhookUrl = `${productionUrl}/api/vapi/webhook`;

    console.log("   Webhook URL:", webhookUrl);
    console.log("   Production URL:", productionUrl);
    console.log("");

    // Step 1: List assistants
    let assistantId = process.argv[2];

    if (!assistantId) {
      console.log("📋 Step 1: Fetching assistants...");
      const listResponse = await fetch("https://api.vapi.ai/assistant", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${vapiApiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!listResponse.ok) {
        const errorText = await listResponse.text();
        console.error("❌ Failed to list assistants:", errorText);
        process.exit(1);
      }

      const assistants = await listResponse.json();
      
      if (!assistants || assistants.length === 0) {
        console.error("❌ No assistants found. Create one in Vapi dashboard first.");
        process.exit(1);
      }

      assistantId = assistants[0].id;
      console.log(`✅ Using assistant: ${assistants[0].name} (${assistantId})\n`);
    } else {
      console.log(`✅ Using specified assistant: ${assistantId}\n`);
    }

    // Step 2: Get current configuration
    console.log("📥 Step 2: Fetching current configuration...");
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

    // Step 3: Build fixed configuration
    console.log("🔧 Step 3: Building fixed configuration...");
    
    // CRITICAL: Set model to null (this is the most important fix!)
    const fixedConfig = {
      // Voice settings (preserve existing or use defaults)
      voice: currentAssistant.voice || {
        provider: "11labs",
        voiceId: "cgSgspJ2msm6clMCkdW9", // Default voice - you should change this
        model: "eleven_turbo_v2_5",
        stability: 0.5,
        similarityBoost: 0.75,
      },
      
      // CRITICAL FIX #1: Set model to null (forces Server URL mode)
      model: null,
      
      // CRITICAL FIX #2: Set Server URL
      serverUrl: webhookUrl,
      
      // CRITICAL FIX #3: Clear first message
      firstMessage: "",
      
      // CRITICAL FIX #4: Set first message mode correctly
      firstMessageMode: "assistant-speaks-first",
      
      // Keep other settings
      name: currentAssistant.name || "Drift AI Receptionist",
      voicemailMessage: currentAssistant.voicemailMessage || "Please call back when you're available.",
      endCallMessage: currentAssistant.endCallMessage || "Goodbye.",
      transcriber: currentAssistant.transcriber || {
        provider: "deepgram",
        model: "nova-2",
        language: "en",
      },
    };

    console.log("📤 Step 4: Updating assistant configuration...");
    console.log("   Changes:");
    console.log(`   - Model: ${currentAssistant.model === null ? "null (already correct)" : "null (CHANGED)"}`);
    console.log(`   - Server URL: ${currentAssistant.serverUrl === webhookUrl ? "correct" : "UPDATED"}`);
    console.log(`   - First Message: ${currentAssistant.firstMessage ? "cleared" : "already empty"}`);
    console.log(`   - First Message Mode: ${currentAssistant.firstMessageMode || "SET"}`);
    console.log("");

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
      console.error("❌ Failed to update assistant:", errorText);
      console.error("   Full error:", await updateResponse.text());
      process.exit(1);
    }

    const updatedAssistant = await updateResponse.json();
    console.log("✅ Assistant configuration updated successfully!\n");

    // Step 5: Fix phone number configuration
    console.log("📞 Step 5: Checking phone number configuration...");
    const phoneResponse = await fetch("https://api.vapi.ai/phone-number", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${vapiApiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (phoneResponse.ok) {
      const phoneNumbers = await phoneResponse.json();
      const linkedNumber = Array.isArray(phoneNumbers) 
        ? phoneNumbers.find(pn => pn.assistantId === assistantId)
        : phoneNumbers;

      if (linkedNumber) {
        console.log(`✅ Found linked phone number: ${linkedNumber.number || linkedNumber.id}`);
        
        // Check if phone number server URL needs updating
        if (linkedNumber.server?.url !== webhookUrl) {
          console.log("   Phone number Server URL needs updating...");
          
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
            console.log("✅ Phone number Server URL updated successfully!\n");
          } else {
            const errorText = await updatePhoneResponse.text();
            console.warn("⚠️  Could not update phone number Server URL:", errorText);
            console.log("   You may need to update this manually in the Vapi dashboard\n");
          }
        } else {
          console.log("✅ Phone number Server URL is already correct\n");
        }
      } else {
        console.log("⚠️  No phone number linked to this assistant");
        console.log("   Link a phone number in Vapi dashboard and run this script again\n");
      }
    } else {
      console.warn("⚠️  Could not check phone numbers\n");
    }

    // Final summary
    console.log("=" .repeat(60));
    console.log("✅ CONFIGURATION FIXED!\n");
    console.log("📋 Final Configuration:");
    console.log(`   Assistant ID: ${updatedAssistant.id}`);
    console.log(`   Name: ${updatedAssistant.name}`);
    console.log(`   Model: ${updatedAssistant.model === null ? "null ✅ (Server URL mode)" : "NOT NULL ❌"}`);
    console.log(`   Server URL: ${updatedAssistant.serverUrl}`);
    console.log(`   First Message: "${updatedAssistant.firstMessage || "(empty) ✅"}"`);
    console.log(`   First Message Mode: ${updatedAssistant.firstMessageMode}`);
    console.log(`   Voice: ${updatedAssistant.voice?.provider || "Not set"} (${updatedAssistant.voice?.voiceId || "no ID"})`);
    
    console.log("\n🧪 Next Steps:");
    console.log("   1. Make a test call to your Vapi phone number");
    console.log("   2. Check Vercel logs for [Vapi] entries");
    console.log("   3. You should see:");
    console.log("      - [Vapi] Call started (request-start)");
    console.log("      - [Vapi] User message received");
    console.log("      - [Vapi] Returning response");
    console.log("\n⚠️  If you only see 'end-of-call-report' in logs:");
    console.log("   - Vapi dashboard might have additional settings");
    console.log("   - Check Vapi dashboard for 'Server Messages/Events' toggles");
    console.log("   - Verify webhook URL is accessible from internet");

  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

fixConfig();

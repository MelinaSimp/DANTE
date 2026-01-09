#!/usr/bin/env node

/**
 * Auto-Configure Vapi Assistant
 * 
 * This script automatically:
 * 1. Lists your Vapi assistants
 * 2. Finds or creates an assistant
 * 3. Configures it with your webhook
 * 4. Sets up ElevenLabs voice
 * 5. Configures Server URL mode (model: null)
 * 
 * Usage:
 *   VAPI_API_KEY=your_key node scripts/auto-configure-vapi.js [assistantId]
 * 
 * If no assistantId provided, it will:
 * - List all assistants and let you choose
 * - Or create a new one if none exist
 */

const vapiApiKey = process.env.VAPI_API_KEY;
const assistantId = process.argv[2];

// Use production URL - update this to your actual production domain
const PRODUCTION_URL = process.env.PRODUCTION_URL || 
                       process.env.NEXT_PUBLIC_APP_URL || 
                       "https://drift-k6yfyzx15-drift4.vercel.app";

const WEBHOOK_URL = `${PRODUCTION_URL}/api/vapi/webhook`;

if (!vapiApiKey) {
  console.error("❌ Error: VAPI_API_KEY environment variable is required");
  console.log("\nUsage: VAPI_API_KEY=your_key node scripts/auto-configure-vapi.js [assistantId]");
  process.exit(1);
}

async function autoConfigure() {
  try {
    console.log("🤖 Auto-Configuring Vapi Assistant\n");
    console.log("   Webhook URL:", WEBHOOK_URL);
    console.log("   Production URL:", PRODUCTION_URL);
    console.log("   API Key:", vapiApiKey.substring(0, 10) + "...\n");

    // Step 1: List assistants or use provided ID
    let targetAssistantId = assistantId;

    if (!targetAssistantId) {
      console.log("📋 Step 1: Listing assistants...");
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
        console.log("⚠️  No assistants found. Creating new assistant...");
        targetAssistantId = await createAssistant();
      } else {
        console.log(`✅ Found ${assistants.length} assistant(s):`);
        assistants.forEach((assistant, index) => {
          console.log(`   ${index + 1}. ${assistant.name} (${assistant.id})`);
        });
        
        // Use first assistant if multiple exist
        targetAssistantId = assistants[0].id;
        console.log(`\n✅ Using assistant: ${assistants[0].name} (${targetAssistantId})`);
      }
    } else {
      console.log(`✅ Using provided assistant ID: ${targetAssistantId}`);
    }

    // Step 2: Get current assistant configuration
    console.log("\n📥 Step 2: Fetching current assistant configuration...");
    const getResponse = await fetch(`https://api.vapi.ai/assistant/${targetAssistantId}`, {
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
    console.log(`   Name: ${currentAssistant.name}`);
    console.log(`   Server URL: ${currentAssistant.serverUrl || "Not set"}`);
    console.log(`   Model: ${currentAssistant.model ? JSON.stringify(currentAssistant.model) : "null"}`);
    console.log(`   Voice: ${currentAssistant.voice?.provider || "Not set"} (${currentAssistant.voice?.voiceId || "N/A"})`);

    // Step 3: Configure assistant
    console.log("\n🔧 Step 3: Configuring assistant for Server URL mode...");
    
    const updatePayload = {
      // Keep existing voice settings (ElevenLabs)
      voice: currentAssistant.voice || {
        provider: "11labs",
        voiceId: "cgSgspJ2msm6clMCkdW9", // Default voice - you can change this
        model: "eleven_turbo_v2_5",
        stability: 0.5,
        similarityBoost: 0.75,
      },
      
      // CRITICAL: Set model to null to force Server URL mode
      model: null,
      
      // Set Server URL
      serverUrl: WEBHOOK_URL,
      
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

    console.log("📤 Updating assistant with configuration...");
    const updateResponse = await fetch(`https://api.vapi.ai/assistant/${targetAssistantId}`, {
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

    // Step 4: Display final configuration
    console.log("📋 Final Configuration:");
    console.log(`   Assistant ID: ${updatedAssistant.id}`);
    console.log(`   Name: ${updatedAssistant.name}`);
    console.log(`   Server URL: ${updatedAssistant.serverUrl}`);
    console.log(`   Model: ${updatedAssistant.model === null ? "null (Server URL mode)" : JSON.stringify(updatedAssistant.model)}`);
    console.log(`   Voice Provider: ${updatedAssistant.voice?.provider || "Not set"}`);
    console.log(`   Voice ID: ${updatedAssistant.voice?.voiceId || "Not set"}`);
    console.log(`   First Message Mode: ${updatedAssistant.firstMessageMode || "Not set"}`);

    // Step 5: Check phone number configuration
    console.log("\n📞 Step 4: Checking phone number configuration...");
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
        ? phoneNumbers.find(pn => pn.assistantId === targetAssistantId)
        : phoneNumbers;

      if (linkedNumber) {
        console.log(`✅ Phone number linked: ${linkedNumber.number || linkedNumber.id}`);
        
        // Update phone number server URL if different
        if (linkedNumber.server?.url !== WEBHOOK_URL) {
          console.log("📞 Updating phone number server URL...");
          const updatePhoneResponse = await fetch(`https://api.vapi.ai/phone-number/${linkedNumber.id}`, {
            method: "PATCH",
            headers: {
              "Authorization": `Bearer ${vapiApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              server: {
                url: WEBHOOK_URL,
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
      } else {
        console.log("⚠️  No phone number linked to this assistant");
        console.log("   You'll need to link a phone number in Vapi dashboard:");
        console.log("   1. Go to https://dashboard.vapi.ai");
        console.log("   2. Navigate to Phone Numbers");
        console.log("   3. Import your Twilio number or buy a new number");
        console.log("   4. Link it to this assistant:", targetAssistantId);
      }
    } else {
      console.log("⚠️  Could not check phone numbers");
    }

    console.log("\n✅ Configuration complete!");
    console.log("\n🧪 Next Steps:");
    console.log("   1. Make a call to your Vapi phone number");
    console.log("   2. Check Vercel logs for [Vapi] entries");
    console.log("   3. Verify scenarios are working");

  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

async function createAssistant() {
  console.log("📤 Creating new assistant...");
  
  const createPayload = {
    name: "Drift AI Receptionist",
    model: null, // Server URL mode
    serverUrl: WEBHOOK_URL,
    voice: {
      provider: "11labs",
      voiceId: "cgSgspJ2msm6clMCkdW9", // Default voice
      model: "eleven_turbo_v2_5",
      stability: 0.5,
      similarityBoost: 0.75,
    },
    firstMessage: "",
    firstMessageMode: "assistant-speaks-first",
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: "en",
    },
    voicemailMessage: "Please call back when you're available.",
    endCallMessage: "Goodbye.",
  };

  const createResponse = await fetch("https://api.vapi.ai/assistant", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${vapiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createPayload),
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    console.error("❌ Failed to create assistant:", errorText);
    process.exit(1);
  }

  const newAssistant = await createResponse.json();
  console.log(`✅ Created new assistant: ${newAssistant.name} (${newAssistant.id})`);
  return newAssistant.id;
}

autoConfigure();

#!/usr/bin/env node

/**
 * Fix Vapi Assistant Voice and Server Configuration
 * 
 * This script:
 * 1. Updates voice to ElevenLabs (required for Server URL to work properly)
 * 2. Ensures Server URL is properly configured
 * 3. Clears any model messages that might interfere
 */

const assistantId = "8b192691-bcec-4f2c-b1e1-7d8a3133411f";
const serverUrl = "https://drift-1et9oivry-drift4.vercel.app/api/vapi/webhook";
const vapiApiKey = "2bf8f671-ccbb-440b-bf7e-9d5985ad3152";
const elevenLabsVoiceId = "cgSgspJ2msm6clMCkdW9"; // Default, should match agent's voice ID

async function fixConfiguration() {
  try {
    console.log("🔧 Fixing Vapi Assistant Configuration...\n");

    // Get current configuration
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

    const current = await getResponse.json();
    
    console.log("Current Configuration:");
    console.log(`   Voice Provider: ${current.voice?.provider || "NOT SET"}`);
    console.log(`   Voice ID: ${current.voice?.voiceId || "NOT SET"}`);
    console.log(`   Server URL: ${current.serverUrl || "NOT SET"}`);
    console.log(`   Server Object: ${JSON.stringify(current.server || {})}`);
    console.log(`   Model Messages: ${JSON.stringify(current.model?.messages || [])}`);
    console.log("");

    // Update configuration
    const updatePayload = {
      // CRITICAL: Set voice to ElevenLabs (required for Server URL)
      voice: {
        provider: "11labs",
        voiceId: elevenLabsVoiceId,
        model: "eleven_turbo_v2_5",
        stability: 0.5,
        similarityBoost: 0.75,
      },
      
      // Ensure Server URL is set (both serverUrl and server object)
      serverUrl: serverUrl,
      server: {
        url: serverUrl,
        timeoutSeconds: 20,
      },
      
      // Ensure model messages are empty (forces Server URL usage)
      model: {
        ...(current.model || {}),
        messages: [], // Empty = use Server URL
      },
      
      // Clear first message
      firstMessage: "",
      
      // Set first message mode
      firstMessageMode: "assistant-speaks-first",
      
      // Keep other settings
      name: current.name,
      voicemailMessage: current.voicemailMessage || "Please call back when you're available.",
      endCallMessage: current.endCallMessage || "Goodbye.",
      transcriber: current.transcriber || {},
    };

    console.log("📤 Updating configuration...");
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

    const updated = await updateResponse.json();
    
    console.log("✅ Configuration Updated!\n");
    console.log("New Configuration:");
    console.log(`   Voice Provider: ${updated.voice?.provider}`);
    console.log(`   Voice ID: ${updated.voice?.voiceId}`);
    console.log(`   Server URL: ${updated.serverUrl}`);
    console.log(`   Server Object: ${JSON.stringify(updated.server || {})}`);
    console.log(`   Model Messages: ${JSON.stringify(updated.model?.messages || [])}`);
    console.log(`   First Message: "${updated.firstMessage || ""}"`);
    console.log(`   First Message Mode: ${updated.firstMessageMode}`);
    
    console.log("\n✅ Configuration fixed!");
    console.log("   - Voice set to ElevenLabs");
    console.log("   - Server URL configured");
    console.log("   - Model messages cleared");
    console.log("\n🧪 Test by making a call - Vapi should now use Server URL");
    
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

fixConfiguration();

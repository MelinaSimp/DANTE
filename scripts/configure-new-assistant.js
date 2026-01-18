#!/usr/bin/env node

/**
 * Configure New Vapi Assistant
 * Assistant ID: 8b192691-bcec-4f2c-b1e1-7d8a3133411f
 */

const assistantId = "8b192691-bcec-4f2c-b1e1-7d8a3133411f";
const serverUrl = "https://drift-1et9oivry-drift4.vercel.app/api/vapi/webhook";
const vapiApiKey = "2bf8f671-ccbb-440b-bf7e-9d5985ad3152";

async function configureAssistant() {
  try {
    console.log("🔍 Step 1: Checking current configuration...\n");

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
    console.log(`   Server URL: ${current.serverUrl || "NOT SET"}`);
    console.log(`   First Message: "${current.firstMessage || ""}"`);
    console.log(`   First Message Mode: ${current.firstMessageMode || "NOT SET"}`);
    console.log(`   Model Messages: ${JSON.stringify(current.model?.messages || [])}`);
    console.log(`   Transcriber: ${JSON.stringify(current.transcriber || {})}\n`);

    console.log("📤 Step 2: Updating configuration...\n");

    const updatePayload = {
      // Keep existing voice settings
      voice: current.voice || {},
      
      // Model configuration - CRITICAL: Empty messages forces Vapi to use Server URL
      model: {
        ...(current.model || {}),
        messages: [], // Empty messages = use Server URL for all responses
      },
      
      // Server URL - this is what Vapi will call
      serverUrl: serverUrl,
      
      // Clear first message (we handle it via webhook)
      firstMessage: "",
      
      // First message mode - assistant speaks first triggers Server URL call
      firstMessageMode: "assistant-speaks-first",
      
      // Keep other settings
      name: current.name,
      voicemailMessage: current.voicemailMessage || "Please call back when you're available.",
      endCallMessage: current.endCallMessage || "Goodbye.",
      transcriber: current.transcriber || {},
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

    const updated = await updateResponse.json();
    
    console.log("✅ Configuration Updated!");
    console.log("\nNew Configuration:");
    console.log(`   Server URL: ${updated.serverUrl}`);
    console.log(`   Model Messages: ${JSON.stringify(updated.model?.messages || [])}`);
    console.log(`   First Message: "${updated.firstMessage || ""}"`);
    console.log(`   First Message Mode: ${updated.firstMessageMode}`);
    console.log(`   Transcriber: ${JSON.stringify(updated.transcriber || {})}`);
    
    console.log("\n✅ Assistant configured successfully!");
    console.log("   Make a test call - Vapi should now use Server URL");
    
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

configureAssistant();

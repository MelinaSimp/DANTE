#!/usr/bin/env node

/**
 * Fix Vapi Server Configuration
 * 
 * This script explicitly sets the model's server field to force
 * Vapi to use the Server URL for all messages.
 */

const assistantId = "67b7fd78-da19-409e-9fd9-c87edf19c3eb";
const serverUrl = "https://drift-1et9oivry-drift4.vercel.app/api/vapi/webhook";
const vapiApiKey = "2bf8f671-ccbb-440b-bf7e-9d5985ad3152";

async function fixServer() {
  try {
    console.log("🔧 Fixing Vapi Server Configuration...\n");

    // Get current config
    const getResponse = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${vapiApiKey}`,
        "Content-Type": "application/json",
      },
    });

    const current = await getResponse.json();
    
    // Update with explicit model.server configuration
    const updatePayload = {
      ...current,
      // Explicitly set model.server to force Server URL usage
      model: {
        ...current.model,
        server: {
          url: serverUrl,
          timeoutSeconds: 20,
        },
        messages: [], // Keep empty
      },
      serverUrl: serverUrl, // Also set at assistant level
      firstMessage: "",
      firstMessageMode: "assistant-speaks-first",
    };

    console.log("📤 Updating assistant with explicit model.server...");
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
      console.error("❌ Failed:", errorText);
      process.exit(1);
    }

    const updated = await updateResponse.json();
    console.log("✅ Updated!");
    console.log(`   model.server.url: ${updated.model?.server?.url || "NOT SET"}`);
    console.log(`   serverUrl: ${updated.serverUrl}`);
    console.log(`   model.messages: ${JSON.stringify(updated.model?.messages || [])}`);
    
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

fixServer();

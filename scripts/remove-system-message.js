#!/usr/bin/env node

/**
 * Remove System Message from Vapi Assistant
 * 
 * The assistant has a system message "You are an assistant." which is
 * causing Vapi to use its own model instead of the Server URL.
 */

const assistantId = "67b7fd78-da19-409e-9fd9-c87edf19c3eb";
const vapiApiKey = "2bf8f671-ccbb-440b-bf7e-9d5985ad3152";

async function removeSystemMessage() {
  try {
    console.log("🔍 Checking for system messages...\n");

    const getResponse = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${vapiApiKey}`,
        "Content-Type": "application/json",
      },
    });

    const current = await getResponse.json();
    
    console.log("Current model.messages:", JSON.stringify(current.model?.messages || [], null, 2));
    console.log("Current model:", JSON.stringify(current.model || {}, null, 2));
    
    // Check if there's a system message anywhere
    const hasSystemMessage = current.model?.messages?.some((msg) => 
      msg.role === "system" || (msg.message && msg.message.includes("assistant"))
    );
    
    if (hasSystemMessage) {
      console.log("\n⚠️  Found system message! Removing it...\n");
    } else {
      console.log("\n✅ No system messages found in model.messages");
      console.log("   But Vapi is still using a system message - checking other locations...\n");
    }

    // Update to completely remove any system messages
    // Only include fields that can be updated (exclude id, orgId, createdAt, etc.)
    const updatePayload = {
      model: {
        model: current.model?.model || "gpt-4o",
        provider: current.model?.provider || "openai",
        // Force empty messages array
        messages: [],
      },
      // Ensure Server URL is set
      serverUrl: "https://drift-1et9oivry-drift4.vercel.app/api/vapi/webhook",
      firstMessage: "",
      firstMessageMode: "assistant-speaks-first",
    };

    console.log("📤 Updating assistant to remove system messages...");
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
    console.log("\nNew configuration:");
    console.log(`   model.messages: ${JSON.stringify(updated.model?.messages || [])}`);
    console.log(`   serverUrl: ${updated.serverUrl}`);
    console.log(`   firstMessage: "${updated.firstMessage}"`);
    console.log(`   firstMessageMode: ${updated.firstMessageMode}`);
    
    console.log("\n✅ System messages removed!");
    console.log("   Make a test call - Vapi should now use Server URL");
    
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

removeSystemMessage();

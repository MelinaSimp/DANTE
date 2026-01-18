#!/usr/bin/env node

/**
 * Configure Vapi with System Message
 * 
 * Instead of empty messages, we'll add a system message that
 * explicitly tells Vapi to use the Server URL for all responses.
 */

const assistantId = "67b7fd78-da19-409e-9fd9-c87edf19c3eb";
const serverUrl = "https://drift-1et9oivry-drift4.vercel.app/api/vapi/webhook";
const vapiApiKey = "2bf8f671-ccbb-440b-bf7e-9d5985ad3152";

async function configureWithSystem() {
  try {
    console.log("🔧 Configuring Vapi with System Message...\n");

    const getResponse = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${vapiApiKey}`,
        "Content-Type": "application/json",
      },
    });

    const current = await getResponse.json();
    
    // Try adding a system message that tells Vapi to use Server URL
    // Some Vapi configurations require at least one message
    const updatePayload = {
      voice: current.voice || {},
      model: {
        ...current.model,
        // Add a system message that explicitly uses Server URL
        messages: [
          {
            role: "system",
            content: "Use the Server URL for all responses. Do not generate responses yourself.",
          },
        ],
      },
      serverUrl: serverUrl,
      firstMessage: "",
      firstMessageMode: "assistant-speaks-first",
      name: current.name,
      voicemailMessage: current.voicemailMessage || "Please call back when you're available.",
      endCallMessage: current.endCallMessage || "Goodbye.",
      transcriber: current.transcriber || {},
    };

    console.log("📤 Updating with system message...");
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
      
      // If that doesn't work, try with empty messages again
      console.log("\n🔄 Trying with empty messages instead...");
      updatePayload.model.messages = [];
      
      const retryResponse = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${vapiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatePayload),
      });
      
      if (!retryResponse.ok) {
        const retryError = await retryResponse.text();
        console.error("❌ Retry also failed:", retryError);
        process.exit(1);
      }
      
      const retryResult = await retryResponse.json();
      console.log("✅ Updated with empty messages");
      console.log(`   model.messages: ${JSON.stringify(retryResult.model?.messages || [])}`);
    } else {
      const updated = await updateResponse.json();
      console.log("✅ Updated with system message");
      console.log(`   model.messages: ${JSON.stringify(updated.model?.messages || [])}`);
    }
    
    console.log(`\n✅ Configuration complete!`);
    console.log(`   Server URL: ${serverUrl}`);
    console.log(`\n🧪 Make a test call and check Vercel logs.`);
    
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

configureWithSystem();

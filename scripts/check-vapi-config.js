#!/usr/bin/env node

/**
 * Check Vapi Configuration Script
 * 
 * This script fetches and displays the full assistant configuration
 * to see what fields are available and what might be missing.
 */

const assistantId = "67b7fd78-da19-409e-9fd9-c87edf19c3eb";
const vapiApiKey = "2bf8f671-ccbb-440b-bf7e-9d5985ad3152";

async function checkConfig() {
  try {
    console.log("🔍 Checking Vapi Assistant Configuration...\n");

    // Get assistant
    const assistantResponse = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${vapiApiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!assistantResponse.ok) {
      const errorText = await assistantResponse.text();
      console.error("❌ Failed to get assistant:", errorText);
      process.exit(1);
    }

    const assistant = await assistantResponse.json();
    
    console.log("📋 Full Assistant Configuration:");
    console.log(JSON.stringify(assistant, null, 2));
    
    console.log("\n🔍 Key Fields:");
    console.log(`   serverUrl: ${assistant.serverUrl || "NOT SET"}`);
    console.log(`   firstMessage: ${assistant.firstMessage || "EMPTY"}`);
    console.log(`   firstMessageMode: ${assistant.firstMessageMode || "NOT SET"}`);
    console.log(`   model.messages: ${JSON.stringify(assistant.model?.messages || [])}`);
    console.log(`   model.server: ${JSON.stringify(assistant.model?.server || "NOT SET")}`);
    
    // Check phone number
    console.log("\n📞 Phone Number Configuration:");
    const phoneResponse = await fetch(`https://api.vapi.ai/phone-number`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${vapiApiKey}`,
        "Content-Type": "application/json",
      },
    });
    
    if (phoneResponse.ok) {
      const phones = await phoneResponse.json();
      const phone = Array.isArray(phones) 
        ? phones.find(pn => pn.assistantId === assistantId)
        : phones;
      
      if (phone) {
        console.log(JSON.stringify(phone, null, 2));
      }
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

checkConfig();

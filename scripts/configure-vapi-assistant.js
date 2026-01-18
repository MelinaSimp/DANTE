#!/usr/bin/env node

/**
 * Configure Vapi Assistant Script
 * 
 * This script automatically configures your Vapi assistant to use your webhook
 * instead of Vapi's default model responses.
 * 
 * Usage:
 *   node scripts/configure-vapi-assistant.js <assistantId> [serverUrl]
 * 
 * Example:
 *   node scripts/configure-vapi-assistant.js 67b7fd78-da19-409e-9fd9-c87edf19c3eb
 */

const assistantId = process.argv[2];
const serverUrl = process.argv[3] || "https://drift-1et9oivry-drift4.vercel.app/api/vapi/webhook";

if (!assistantId) {
  console.error("❌ Error: assistantId is required");
  console.log("\nUsage: node scripts/configure-vapi-assistant.js <assistantId> [serverUrl]");
  console.log("\nExample:");
  console.log("  node scripts/configure-vapi-assistant.js 67b7fd78-da19-409e-9fd9-c87edf19c3eb");
  process.exit(1);
}

async function configureAssistant() {
  try {
    console.log("🔧 Configuring Vapi Assistant...");
    console.log(`   Assistant ID: ${assistantId}`);
    console.log(`   Server URL: ${serverUrl}\n`);

    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "https://drift-1et9oivry-drift4.vercel.app"}/api/vapi/configure-assistant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        assistantId,
        serverUrl,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("❌ Error:", error.error || "Failed to configure assistant");
      process.exit(1);
    }

    const result = await response.json();
    console.log("✅ Assistant configured successfully!");
    console.log("\nConfiguration:");
    console.log(`   Name: ${result.assistant.name}`);
    console.log(`   Server URL: ${result.assistant.serverUrl}`);
    console.log("\n✅ Your assistant is now configured to use your webhook!");
    console.log("   Test it by making a call to your phone number.");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

configureAssistant();

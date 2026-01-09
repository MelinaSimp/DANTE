#!/usr/bin/env node

/**
 * Auto-Configure Vapi Assistant (Simplified)
 * 
 * This script automatically configures your Vapi assistant via your own API endpoint.
 * 
 * Usage:
 *   VAPI_API_KEY=your_key PRODUCTION_URL=https://your-domain.com node scripts/configure-vapi-auto.js [assistantId]
 */

const vapiApiKey = process.env.VAPI_API_KEY;
const productionUrl = process.env.PRODUCTION_URL || "https://drift-k6yfyzx15-drift4.vercel.app";
const assistantId = process.argv[2];

if (!vapiApiKey) {
  console.error("❌ Error: VAPI_API_KEY environment variable is required");
  process.exit(1);
}

async function configureViaAPI() {
  try {
    if (!assistantId) {
      // First, list assistants to find one
      console.log("📋 Listing Vapi assistants...");
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
        console.log("\n💡 Tip: Create an assistant in Vapi dashboard first, then run:");
        console.log(`   VAPI_API_KEY=${vapiApiKey} node scripts/configure-vapi-auto.js <assistantId>`);
        process.exit(1);
      }

      const assistants = await listResponse.json();
      
      if (!assistants || assistants.length === 0) {
        console.error("❌ No assistants found. Please create one in Vapi dashboard first.");
        process.exit(1);
      }

      console.log(`✅ Found ${assistants.length} assistant(s):`);
      assistants.forEach((assistant, index) => {
        console.log(`   ${index + 1}. ${assistant.name} (${assistant.id})`);
      });
      
      const firstId = assistants[0].id;
      console.log(`\n✅ Using first assistant: ${assistants[0].name} (${firstId})`);
      console.log(`\n📤 Configuring via API endpoint: ${productionUrl}/api/vapi/configure-assistant`);
      
      const configureResponse = await fetch(`${productionUrl}/api/vapi/configure-assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assistantId: firstId,
          serverUrl: `${productionUrl}/api/vapi/webhook`,
        }),
      });

      if (!configureResponse.ok) {
        const errorText = await configureResponse.text();
        console.error("❌ Configuration failed:", errorText);
        process.exit(1);
      }

      const result = await configureResponse.json();
      console.log("\n✅ Configuration complete!");
      console.log(JSON.stringify(result, null, 2));
      
    } else {
      console.log(`📤 Configuring assistant ${assistantId}...`);
      console.log(`   Webhook URL: ${productionUrl}/api/vapi/webhook`);
      
      const configureResponse = await fetch(`${productionUrl}/api/vapi/configure-assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assistantId: assistantId,
          serverUrl: `${productionUrl}/api/vapi/webhook`,
        }),
      });

      if (!configureResponse.ok) {
        const errorText = await configureResponse.text();
        console.error("❌ Configuration failed:", errorText);
        process.exit(1);
      }

      const result = await configureResponse.json();
      console.log("\n✅ Configuration complete!");
      console.log(JSON.stringify(result, null, 2));
    }

    console.log("\n🧪 Next Steps:");
    console.log("   1. Make a call to your Vapi phone number");
    console.log("   2. Check Vercel logs for [Vapi] entries");
    console.log("   3. Verify scenarios are working");

  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

configureViaAPI();

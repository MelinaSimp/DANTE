#!/usr/bin/env node

/**
 * Diagnose Vapi Configuration
 * 
 * This script checks your Vapi assistant configuration and identifies issues
 * 
 * Usage:
 *   VAPI_API_KEY=your_key node scripts/diagnose-vapi.js [assistantId]
 */

const vapiApiKey = process.env.VAPI_API_KEY;

if (!vapiApiKey) {
  console.error("❌ Error: VAPI_API_KEY environment variable is required");
  process.exit(1);
}

async function diagnose() {
  try {
    console.log("🔍 Diagnosing Vapi Configuration...\n");

    // Step 1: List assistants
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

    console.log(`✅ Found ${assistants.length} assistant(s)\n`);

    // Use first assistant (or specified one)
    const assistantId = process.argv[2] || assistants[0].id;
    console.log(`🔍 Diagnosing assistant: ${assistantId}\n`);

    // Step 2: Get assistant details
    console.log("📥 Step 2: Fetching assistant configuration...");
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

    const assistant = await getResponse.json();
    console.log("✅ Got assistant configuration\n");

    // Step 3: Diagnose issues
    console.log("🔍 DIAGNOSIS REPORT\n");
    console.log("=" .repeat(60));

    const issues = [];
    const warnings = [];
    const correct = [];

    // Check model
    if (assistant.model === null) {
      correct.push("✅ Model is null (Server URL mode enabled)");
    } else if (assistant.model && typeof assistant.model === 'object') {
      if (assistant.model.messages && Array.isArray(assistant.model.messages) && assistant.model.messages.length > 0) {
        issues.push(`❌ Model has ${assistant.model.messages.length} messages - this will override Server URL!`);
        issues.push(`   Messages: ${JSON.stringify(assistant.model.messages, null, 2)}`);
      } else {
        warnings.push("⚠️  Model is not null (should be null for Server URL mode)");
        warnings.push(`   Model: ${JSON.stringify(assistant.model, null, 2)}`);
      }
    } else {
      warnings.push("⚠️  Model configuration unclear");
      warnings.push(`   Model: ${assistant.model}`);
    }

    // Check Server URL
    const expectedServerUrl = process.env.PRODUCTION_URL || 
                               process.env.NEXT_PUBLIC_APP_URL || 
                               "https://drift-8wxgu825o-drift4.vercel.app";
    const expectedWebhookUrl = `${expectedServerUrl}/api/vapi/webhook`;

    if (assistant.serverUrl === expectedWebhookUrl) {
      correct.push(`✅ Server URL is correct: ${assistant.serverUrl}`);
    } else if (assistant.serverUrl) {
      warnings.push(`⚠️  Server URL might be incorrect`);
      warnings.push(`   Current: ${assistant.serverUrl}`);
      warnings.push(`   Expected: ${expectedWebhookUrl}`);
    } else {
      issues.push("❌ Server URL is not set!");
    }

    // Check firstMessage
    if (!assistant.firstMessage || assistant.firstMessage.trim() === "") {
      correct.push("✅ First message is empty (good for Server URL mode)");
    } else {
      warnings.push(`⚠️  First message is set: "${assistant.firstMessage.substring(0, 50)}..."`);
      warnings.push("   This might override Server URL for the first message");
    }

    // Check firstMessageMode
    if (assistant.firstMessageMode === "assistant-speaks-first") {
      correct.push("✅ First message mode is 'assistant-speaks-first'");
    } else {
      warnings.push(`⚠️  First message mode is: "${assistant.firstMessageMode}"`);
      warnings.push("   Should be 'assistant-speaks-first' for Server URL mode");
    }

    // Check voice
    if (assistant.voice && assistant.voice.provider === "11labs") {
      correct.push(`✅ Voice is configured: ${assistant.voice.provider} (${assistant.voice.voiceId || "no voice ID"})`);
    } else {
      warnings.push("⚠️  Voice not configured for ElevenLabs");
      warnings.push(`   Voice: ${JSON.stringify(assistant.voice, null, 2)}`);
    }

    // Step 4: Check phone numbers
    console.log("\n📞 Step 3: Checking phone number configuration...");
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
        console.log(`✅ Phone number linked: ${linkedNumber.number || linkedNumber.id}\n`);
        
        // Check phone number server URL
        if (linkedNumber.server && linkedNumber.server.url) {
          if (linkedNumber.server.url === expectedWebhookUrl) {
            correct.push(`✅ Phone number Server URL is correct: ${linkedNumber.server.url}`);
          } else {
            warnings.push(`⚠️  Phone number Server URL might be incorrect`);
            warnings.push(`   Current: ${linkedNumber.server.url}`);
            warnings.push(`   Expected: ${expectedWebhookUrl}`);
          }
        } else {
          warnings.push("⚠️  Phone number Server URL is not set");
        }
      } else {
        warnings.push("⚠️  No phone number linked to this assistant");
      }
    } else {
      warnings.push("⚠️  Could not check phone numbers");
    }

    // Print report
    console.log("\n" + "=".repeat(60));
    console.log("📊 DIAGNOSIS SUMMARY\n");

    if (correct.length > 0) {
      console.log("✅ CORRECT CONFIGURATIONS:");
      correct.forEach(item => console.log(`   ${item}`));
      console.log("");
    }

    if (warnings.length > 0) {
      console.log("⚠️  WARNINGS:");
      warnings.forEach(item => console.log(`   ${item}`));
      console.log("");
    }

    if (issues.length > 0) {
      console.log("❌ CRITICAL ISSUES:");
      issues.forEach(item => console.log(`   ${item}`));
      console.log("");
    }

    // Summary
    console.log("=".repeat(60));
    if (issues.length > 0) {
      console.log("❌ ISSUES FOUND - Configuration needs fixing");
      console.log("\n💡 Run the fix script:");
      console.log(`   VAPI_API_KEY=${vapiApiKey} node scripts/fix-vapi-config.js ${assistantId}`);
    } else if (warnings.length > 0) {
      console.log("⚠️  Configuration has warnings - might still work");
      console.log("\n💡 Consider running the fix script to optimize:");
      console.log(`   VAPI_API_KEY=${vapiApiKey} node scripts/fix-vapi-config.js ${assistantId}`);
    } else {
      console.log("✅ Configuration looks good!");
      console.log("\n💡 If it's still not working, the issue might be:");
      console.log("   1. Vapi dashboard settings (not accessible via API)");
      console.log("   2. Network/firewall blocking webhook calls");
      console.log("   3. Webhook returning errors (check Vercel logs)");
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

diagnose();

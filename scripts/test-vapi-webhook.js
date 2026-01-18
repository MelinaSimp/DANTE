#!/usr/bin/env node

/**
 * Test Vapi Webhook Script
 * 
 * Simulates a Vapi webhook call to test if user questions are processed correctly
 * 
 * Usage:
 *   node scripts/test-vapi-webhook.js [question]
 * 
 * Example:
 *   node scripts/test-vapi-webhook.js "What are your business hours?"
 */

const question = process.argv[2] || "What company do you work for?";
const baseUrl = process.env.PUBLIC_BASE_URL || "https://driftai.studio";
const assistantId = "8b192691-bcec-4f2c-b1e1-7d8a3133411f";
const phoneNumber = "+12163508215";
const testCallId = `test-call-${Date.now()}`;

console.log("🧪 Testing Vapi Webhook with User Question\n");
console.log("Question:", question);
console.log("Webhook URL:", `${baseUrl}/api/vapi/webhook`);
console.log("Call ID:", testCallId);
console.log("");

async function testWebhook() {
  try {
    // Step 1: Simulate request-start (call initiation)
    console.log("📞 Step 1: Simulating call start (request-start)...");
    const requestStartPayload = {
      type: "request-start",
      message: {
        type: "request-start",
        role: "system",
      },
      call: {
        id: testCallId,
        phoneNumber: phoneNumber,
        customer: {
          number: "+1234567890",
        },
      },
      phoneNumber: {
        number: phoneNumber,
      },
      assistant: {
        id: assistantId,
      },
    };

    const startResponse = await fetch(`${baseUrl}/api/vapi/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestStartPayload),
    });

    const startResult = await startResponse.json();
    console.log("✅ Call start response:", JSON.stringify(startResult, null, 2).substring(0, 500));
    console.log("");

    // Wait a bit for conversation to be created
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 2: Simulate user message (user asking a question)
    console.log("💬 Step 2: Simulating user question...");
    const userMessagePayload = {
      type: "user",
      message: {
        type: "user",
        role: "user",
        content: question,
        call: {
          id: testCallId,
        },
      },
      call: {
        id: testCallId,
        phoneNumber: phoneNumber,
        customer: {
          number: "+1234567890",
        },
      },
      phoneNumber: {
        number: phoneNumber,
      },
      assistant: {
        id: assistantId,
      },
    };

    const userResponse = await fetch(`${baseUrl}/api/vapi/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userMessagePayload),
    });

    const userResult = await userResponse.json();
    console.log("✅ User question response:");
    console.log("Status:", userResponse.status);
    console.log("Response:", JSON.stringify(userResult, null, 2));
    console.log("");

    // Check if response contains the answer
    if (userResult.messages && userResult.messages.length > 0) {
      const assistantMessage = userResult.messages.find(m => m.role === "assistant");
      if (assistantMessage) {
        console.log("📝 Assistant Response:");
        console.log(assistantMessage.content);
        console.log("");
        
        // Check if response uses data sources (not generic)
        const genericPhrases = ["available 24/7", "I don't have that information", "I'm not sure"];
        const isGeneric = genericPhrases.some(phrase => 
          assistantMessage.content.toLowerCase().includes(phrase.toLowerCase())
        );
        
        if (isGeneric) {
          console.log("⚠️  WARNING: Response appears to be generic and may not be using data sources!");
        } else {
          console.log("✅ Response appears to be using data sources (not generic)");
        }
      }
    } else if (userResult.response) {
      console.log("📝 Assistant Response:");
      console.log(userResult.response);
    } else {
      console.log("⚠️  No response content found in webhook response");
    }

    console.log("\n✅ Test complete!");
    console.log("\n📋 Next steps:");
    console.log("1. Check Vercel logs for detailed execution logs");
    console.log("2. Look for: [Vapi] User message received");
    console.log("3. Look for: [AgentExecutor] Context loaded (should show data sources)");
    console.log("4. Look for: [Say] AI response generated");

  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testWebhook();

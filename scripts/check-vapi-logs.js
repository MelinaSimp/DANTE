#!/usr/bin/env node

/**
 * Check Vapi Webhook Logs
 * 
 * This helps identify if Vapi is calling the webhook and what errors might be occurring
 */

console.log("=== VAPI WEBHOOK DIAGNOSTIC ===\n");
console.log("To check for errors, go to:");
console.log("1. Vercel Dashboard → Your Project → Deployments");
console.log("2. Click latest deployment → Functions tab");
console.log("3. Look for /api/vapi/webhook function");
console.log("4. Check for these log patterns:\n");

console.log("✅ GOOD SIGNS (Webhook is being called):");
console.log("   - [Vapi] Call started (request-start)");
console.log("   - [Vapi] User message received");
console.log("   - [Vapi] Returning response");
console.log("   - Status: 200\n");

console.log("❌ BAD SIGNS (Webhook has errors):");
console.log("   - [Vapi] Missing call information");
console.log("   - [Vapi] Agent not found");
console.log("   - [Vapi] Webhook error");
console.log("   - Status: 400 or 500\n");

console.log("⚠️  PROBLEM (Webhook not being called):");
console.log("   - Only [Vapi] End-of-call-report received");
console.log("   - No [Vapi] Call started (request-start)");
console.log("   - No [Vapi] User message received");
console.log("   - This means Vapi is using its own model\n");

console.log("=== POTENTIAL WEBHOOK ERRORS ===\n");
console.log("The webhook can return these errors:");
console.log("1. 400 - Missing call information in request-start");
console.log("2. 400 - Invalid phone number format");
console.log("3. 400 - Missing call information (general)");
console.log("4. 404 - Agent not found");
console.log("5. 500 - Failed to create conversation");
console.log("6. 500 - Internal server error\n");

console.log("If Vapi sees these errors, it might:");
console.log("- Stop using the webhook");
console.log("- Fall back to its own model");
console.log("- Only call webhook for end-of-call-report\n");

console.log("=== WHAT TO CHECK ===\n");
console.log("1. Check Vercel logs for the webhook function");
console.log("2. Look for any 400/500 errors");
console.log("3. Check if [Vapi] Call started appears");
console.log("4. If no errors but still not working, it's a Vapi dashboard setting\n");

console.log("=== NEXT STEPS ===\n");
console.log("If you see errors:");
console.log("- Fix the webhook to handle edge cases");
console.log("- Make sure webhook always returns 200 OK\n");

console.log("If you DON'T see errors but Vapi still uses its own model:");
console.log("- Check Vapi Dashboard → Advanced tab");
console.log("- Look for 'Server URL Events' or 'Webhook Events' checkboxes");
console.log("- Enable request-start, user, assistant events\n");

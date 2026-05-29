/**
 * VAPI Sync Module
 * Maps Drift agent configuration → VAPI assistant configuration
 * Handles creating/updating VAPI assistants and phone numbers
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/app-url";
import {
  createAssistant,
  updateAssistant,
  deleteAssistant,
  importTwilioNumber,
  updatePhoneNumber,
  deletePhoneNumber,
  type VapiAssistantConfig,
} from "./client";

// getAppUrl() strips trailing whitespace + slash; NEXT_PUBLIC_APP_URL
// on Vercel had a trailing newline that made VAPI reject the webhook
// URL as malformed ("found https://driftai.studio\n/api/vapi/server-url").
const SERVER_URL = `${getAppUrl()}/api/vapi/server-url`;

/**
 * Build a VAPI assistant config from a Drift agent
 */
async function buildAssistantConfig(agentId: string): Promise<VapiAssistantConfig> {
  // Load agent
  const { data: agent, error: agentError } = await supabaseAdmin
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .single();

  if (agentError || !agent) {
    throw new Error(`Agent ${agentId} not found: ${agentError?.message}`);
  }

  // Load data sources for knowledge base
  const { data: dataSources } = await supabaseAdmin
    .from("agent_data_sources")
    .select("name, content, type")
    .eq("agent_id", agentId);

  // Load scenarios + steps for system prompt context
  const { data: scenarios } = await supabaseAdmin
    .from("scenarios")
    .select("id, name")
    .eq("agent_id", agentId);

  let scenarioContext = "";
  if (scenarios && scenarios.length > 0) {
    for (const scenario of scenarios) {
      const { data: steps } = await supabaseAdmin
        .from("steps")
        .select("type, ai_message, name")
        .eq("scenario_id", scenario.id)
        .order("sort_order");

      if (steps && steps.length > 0) {
        scenarioContext += `\n\nSCENARIO: ${scenario.name}\nSteps:\n`;
        for (const step of steps) {
          scenarioContext += `- ${step.type}: ${step.ai_message || step.name || ""}\n`;
        }
      }
    }
  }

  // Build knowledge base from data sources
  let knowledgeBase = "";
  if (dataSources && dataSources.length > 0) {
    const validSources = dataSources
      .filter((ds) => ds.content && ds.content.trim().length > 0)
      .slice(0, 10);

    if (validSources.length > 0) {
      knowledgeBase = validSources
        .map((ds) => {
          const content = ds.content.length > 2000 ? ds.content.substring(0, 2000) + "..." : ds.content;
          return `[${ds.name || "Data Source"}]\n${content}`;
        })
        .join("\n\n");
    }
  }

  // Build system prompt. Two paths:
  //   - mode='scenario' (new) — translate the JSONB scenario graph to a
  //     deterministic numbered script via scenarioToSystemPrompt. The
  //     llm_instructions are ignored; the script wins.
  //   - mode='llm' or unset — current behavior: free-form persona prompt.
  //
  // When the entry node is a "say", we hoist its text into VAPI's
  // firstMessage (further down) AND tell the prompt compiler to skip
  // it. Without that, VAPI plays the canned "Hello! This is …" greeting
  // because firstMessage was never set from the scenario, and the
  // scripted Step 1 only fires after the LLM takes over post-greeting.
  let systemPrompt = "";
  let scenarioFirstMessage: string | null = null;

  if (agent.mode === "scenario" && agent.scenario) {
    const { scenarioToSystemPrompt, isScenario } = await import("./scenario-prompt");
    if (isScenario(agent.scenario)) {
      const sc = agent.scenario as any;
      const entryNode = sc.nodes?.find((n: any) => n.id === sc.entry);
      // Two entry-hoist shapes:
      //   say   → hoist text to firstMessage, SKIP the node from the
      //           script (otherwise the LLM repeats it on turn 1).
      //   branch → hoist the prompt to firstMessage, KEEP the branch in
      //           the script (the routing rules are still needed) but
      //           mark it as "already asked" so the LLM treats the
      //           caller's first turn as the answer, not a fresh ask.
      const isSayEntry =
        entryNode?.type === "say" &&
        typeof entryNode.text === "string" &&
        entryNode.text.trim().length > 0;
      const isBranchEntry =
        entryNode?.type === "branch" &&
        typeof entryNode.prompt === "string" &&
        entryNode.prompt.trim().length > 0;
      if (isSayEntry) {
        scenarioFirstMessage = entryNode.text.trim();
      } else if (isBranchEntry) {
        scenarioFirstMessage = entryNode.prompt.trim();
      }
      systemPrompt = scenarioToSystemPrompt(agent.scenario, agent.name, {
        skipEntryNode: isSayEntry,
        entryAlreadyAsked: isBranchEntry,
      });
    } else {
      systemPrompt = `You are ${agent.name}. The scenario data is malformed; ask the user to retry shortly.`;
    }
  } else if (agent.llm_instructions && agent.llm_instructions.trim()) {
    systemPrompt = agent.llm_instructions.trim();
  } else {
    systemPrompt = `You are ${agent.name}. ${agent.description || "You are a helpful AI assistant."}`;
  }

  // Legacy `scenarios` + `steps` table — only stitched in for LLM mode
  // since scenario mode is the new authoritative path.
  if (scenarioContext && agent.mode !== "scenario") {
    systemPrompt += `\n\nCONVERSATION FLOW:${scenarioContext}`;
  }

  if (knowledgeBase) {
    systemPrompt += `\n\nKNOWLEDGE BASE (use this to answer questions):\n${knowledgeBase}\n\nIMPORTANT: Use information from the Knowledge Base above when answering factual questions.`;
  }

  // Add current date context and scheduling capabilities.
  //
  // IMPORTANT: we must NOT bake `new Date()` into the string here. The
  // system prompt is stored on the VAPI assistant at sync time and
  // reused on every subsequent call — if we hardcode today's date, the
  // agent will still think it's Feb 27 a month from now.
  //
  // Instead we use VAPI's built-in dynamic variables ({{now}}, {{date}},
  // {{year}}) which VAPI substitutes per-call at the moment the phone
  // rings. The assistant always sees the real current date without any
  // re-sync, cron, or manual re-deploy.
  //
  // Ref: https://docs.vapi.ai/assistants/dynamic-variables
  systemPrompt += `\n\nCURRENT DATE: Today is {{date}} ({{now}}). The current year is {{year}}. ALWAYS use {{year}} as the year when the caller doesn't specify a year. NEVER guess or remember a date from past context — always use the values above, which are replaced live at call time.

SCHEDULING CAPABILITIES:
You can schedule appointments and check availability. When a caller wants to schedule a meeting or appointment:
1. Ask for their name if you don't have it.
2. Ask what date and time they'd prefer.
3. Use the check_availability function to see open slots. The date MUST be in YYYY-MM-DD format using the current year ({{year}}).
4. Use the schedule_appointment function to book the appointment. The scheduledAt MUST be in ISO 8601 format (YYYY-MM-DDTHH:MM:SS) using the current year.
Keep responses short and natural for voice (1-3 sentences).`;

  // Build tools for function calling
  const tools: any[] = [
    {
      type: "function",
      function: {
        name: "schedule_appointment",
        description: "Schedule an appointment for the caller. Always include a conversationSummary with a brief overview of what was discussed on the call.",
        parameters: {
          type: "object",
          properties: {
            contactName: { type: "string", description: "The caller's name" },
            scheduledAt: { type: "string", description: "Date and time in ISO 8601 format (YYYY-MM-DDTHH:MM:SS)" },
            serviceType: { type: "string", description: "Type of service or appointment (e.g., 'Consultation', 'Meeting')" },
            durationMinutes: { type: "number", description: "Duration in minutes (default: 60)" },
            conversationSummary: { type: "string", description: "A 2-3 sentence AI-generated summary of what was discussed on this call and why the appointment is being scheduled. Include key topics, concerns, and goals mentioned by the caller." },
          },
          required: ["scheduledAt", "serviceType", "conversationSummary"],
        },
      },
      server: {
        url: SERVER_URL,
      },
    },
    {
      type: "function",
      function: {
        name: "check_availability",
        description: "Check available appointment time slots for a specific date",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "Date in YYYY-MM-DD format" },
            durationMinutes: { type: "number", description: "Duration in minutes (default: 60)" },
          },
          required: ["date"],
        },
      },
      server: {
        url: SERVER_URL,
      },
    },
    {
      // Voicemail step — recording is automatic via VAPI's call
      // recording. This tool flips a flag so end-of-call-report
      // notifies the right destination with the transcript + recording.
      // The optional routing args (label / sms_to / email_to) come from
      // the scenario voicemail node so different call categories can
      // land in different inboxes.
      type: "function",
      function: {
        name: "send_to_voicemail",
        description:
          "Activate voicemail mode. Speak the greeting verbatim, then stay quiet while the caller records. After they finish, thank them and end the call. Pass through any label/sms_to/email_to values from the voicemail step exactly as provided.",
        parameters: {
          type: "object",
          properties: {
            greeting: {
              type: "string",
              description:
                "The exact voicemail greeting from the script step (e.g. 'You've reached the voicemail of …. Please leave a message after the tone.').",
            },
            label: {
              type: "string",
              description:
                "Category label for this voicemail (e.g. 'Property Management', 'Accounting'). Pass through verbatim from the voicemail step. Used in the notification subject/header.",
            },
            sms_to: {
              type: "string",
              description:
                "E.164 phone number that should receive the transcript by SMS (e.g. '+15551110001'). Pass through verbatim from the voicemail step. Omit if the step doesn't specify one.",
            },
            email_to: {
              type: "string",
              description:
                "Additional email recipient (sent in addition to the workspace owner). Pass through verbatim from the voicemail step. Omit if the step doesn't specify one.",
            },
            human_hours: {
              type: "string",
              description:
                "JSON-encoded schedule for 'live transfer during certain hours'. Pass through verbatim from the voicemail step exactly as shown. The webhook does the time check server-side. Omit if the step doesn't specify human_hours.",
            },
            human_transfer_to: {
              type: "string",
              description:
                "E.164 number to bridge to when the current time is inside human_hours. Pass through verbatim. Omit if the step doesn't specify human_transfer_to.",
            },
            human_ring_seconds: {
              type: "number",
              description:
                "Seconds the human's phone is allowed to ring before the call falls back to voicemail recording. Pass through verbatim from the voicemail step. Omit if not specified.",
            },
          },
          required: ["greeting"],
        },
      },
      server: { url: SERVER_URL },
    },
    {
      // Transfer step — bridges the caller to a configured number.
      // Implementation pending in handleToolCalls; for now the model
      // will see this tool but the handler returns "not implemented".
      type: "function",
      function: {
        name: "transfer_call",
        description:
          "Bridge the caller to another phone number. Use only when a transfer step in the script says to.",
        parameters: {
          type: "object",
          properties: {
            to_number: {
              type: "string",
              description: "E.164 phone number to transfer the caller to (e.g. +14155551234).",
            },
          },
          required: ["to_number"],
        },
      },
      server: { url: SERVER_URL },
    },
  ];

  // Build first message (greeting). Precedence:
  //   1. agents.first_message — explicit override from the CRM
  //   2. Scenario JSONB entry node text when it's a "say" (hoisted above)
  //   3. First step's ai_message of the legacy scenarios table
  //   4. Generic `Hello! This is {name}…` fallback
  let firstMessage = `Hello! This is ${agent.name}. How can I help you today?`;
  if (agent.first_message && agent.first_message.trim()) {
    firstMessage = agent.first_message.trim();
  } else if (scenarioFirstMessage) {
    firstMessage = scenarioFirstMessage;
  } else if (scenarios && scenarios.length > 0) {
    const { data: firstStep } = await supabaseAdmin
      .from("steps")
      .select("ai_message")
      .eq("scenario_id", scenarios[0].id)
      .eq("sort_order", 0)
      .maybeSingle();

    if (firstStep?.ai_message) {
      firstMessage = firstStep.ai_message;
    }
  }

  // Build voice config
  const voiceConfig: VapiAssistantConfig["voice"] = agent.elevenlabs_voice_id
    ? {
        provider: "11labs",
        voiceId: agent.elevenlabs_voice_id,
      }
    : undefined;

  return {
    name: `Drift - ${agent.name}`,
    firstMessage,
    model: {
      provider: "openai",
      model: agent.llm_model || "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }],
      tools,
      temperature: 0.3,
      maxTokens: 300,
    },
    voice: voiceConfig,
    serverUrl: SERVER_URL,
    serverMessages: [
      "end-of-call-report",
      "status-update",
      "tool-calls",
    ],
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: "en",
    },
    maxDurationSeconds: 1800,
    silenceTimeoutSeconds: 30,
  };
}

/**
 * Sync a Drift agent to VAPI — creates or updates the VAPI assistant
 * Returns the VAPI assistant ID
 */
export async function syncAgentToVapi(agentId: string): Promise<{ assistantId: string }> {
  const config = await buildAssistantConfig(agentId);

  // Check if agent already has a VAPI assistant
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("vapi_assistant_id")
    .eq("id", agentId)
    .single();

  let assistantId: string;

  if (agent?.vapi_assistant_id) {
    // Update existing assistant
    try {
      await updateAssistant(agent.vapi_assistant_id, config);
      assistantId = agent.vapi_assistant_id;
      console.log(`[VAPI Sync] Updated assistant ${assistantId} for agent ${agentId}`);
    } catch (err: any) {
      // If update fails (e.g. assistant was deleted in VAPI), create new one
      if (err.message.includes("404")) {
        const result = await createAssistant(config);
        assistantId = result.id;
        console.log(`[VAPI Sync] Previous assistant gone, created new ${assistantId} for agent ${agentId}`);
      } else {
        throw err;
      }
    }
  } else {
    // Create new assistant
    const result = await createAssistant(config);
    assistantId = result.id;
    console.log(`[VAPI Sync] Created new assistant ${assistantId} for agent ${agentId}`);
  }

  // Save assistant ID to agent
  await supabaseAdmin
    .from("agents")
    .update({ vapi_assistant_id: assistantId })
    .eq("id", agentId);

  return { assistantId };
}

/**
 * Import a Twilio phone number into VAPI and link it to an assistant
 * Returns the VAPI phone number ID
 */
export async function importPhoneToVapi(
  agentId: string,
  phoneNumber: string,
  assistantId: string
): Promise<{ phoneNumberId: string }> {
  const twilioAccountSid = process.env.TWILIO_MASTER_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_MASTER_AUTH_TOKEN;

  if (!twilioAccountSid || !twilioAuthToken) {
    throw new Error("TWILIO_MASTER_ACCOUNT_SID and TWILIO_MASTER_AUTH_TOKEN are required");
  }

  // Check if agent already has a VAPI phone number. Pull the agent name
  // too — VAPI's phone-number `name` field is capped at 40 chars, so
  // we mirror the assistant naming ("Drift - {name}") instead of using
  // the agent UUID, which exceeds the limit on its own.
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("vapi_phone_number_id, name")
    .eq("id", agentId)
    .single();

  // 40-char cap, conservative trim with ellipsis if the agent name is huge.
  const friendlyName = (() => {
    const base = `Drift - ${agent?.name ?? "Agent"}`;
    return base.length <= 40 ? base : base.slice(0, 39) + "…";
  })();

  let phoneNumberId: string;

  if (agent?.vapi_phone_number_id) {
    // Update existing phone number to point to new assistant
    try {
      await updatePhoneNumber(agent.vapi_phone_number_id, { assistantId });
      phoneNumberId = agent.vapi_phone_number_id;
      console.log(`[VAPI Sync] Updated phone number ${phoneNumberId} → assistant ${assistantId}`);
    } catch (err: any) {
      // If update fails, re-import
      if (err.message.includes("404")) {
        const result = await importTwilioNumber({
          provider: "twilio",
          number: phoneNumber,
          twilioAccountSid,
          twilioAuthToken,
          assistantId,
          name: friendlyName,
        });
        phoneNumberId = result.id;
        console.log(`[VAPI Sync] Re-imported phone number ${phoneNumberId} for agent ${agentId}`);
      } else {
        throw err;
      }
    }
  } else {
    // Import phone number for the first time
    const result = await importTwilioNumber({
      provider: "twilio",
      number: phoneNumber,
      twilioAccountSid,
      twilioAuthToken,
      assistantId,
      name: friendlyName,
    });
    phoneNumberId = result.id;
    console.log(`[VAPI Sync] Imported phone number ${phoneNumberId} for agent ${agentId}`);
  }

  // Save phone number ID to agent
  await supabaseAdmin
    .from("agents")
    .update({ vapi_phone_number_id: phoneNumberId })
    .eq("id", agentId);

  return { phoneNumberId };
}

/**
 * Remove VAPI resources for an agent (when switching back to custom or undeploying)
 */
export async function removeVapiResources(agentId: string): Promise<void> {
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("vapi_assistant_id, vapi_phone_number_id")
    .eq("id", agentId)
    .single();

  if (!agent) return;

  // Delete phone number first (it references the assistant)
  if (agent.vapi_phone_number_id) {
    try {
      await deletePhoneNumber(agent.vapi_phone_number_id);
      console.log(`[VAPI Sync] Deleted phone number ${agent.vapi_phone_number_id}`);
    } catch (err) {
      console.error(`[VAPI Sync] Failed to delete phone number:`, err);
    }
  }

  // Delete assistant
  if (agent.vapi_assistant_id) {
    try {
      await deleteAssistant(agent.vapi_assistant_id);
      console.log(`[VAPI Sync] Deleted assistant ${agent.vapi_assistant_id}`);
    } catch (err) {
      console.error(`[VAPI Sync] Failed to delete assistant:`, err);
    }
  }

  // Clear IDs from agent
  await supabaseAdmin
    .from("agents")
    .update({ vapi_assistant_id: null, vapi_phone_number_id: null })
    .eq("id", agentId);
}

/**
 * Reconfigure Twilio phone number webhook back to our custom endpoint
 * Called when switching from VAPI back to custom
 */
export async function reconfigureTwilioWebhook(phoneNumber: string): Promise<void> {
  const twilioAccountSid = process.env.TWILIO_MASTER_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_MASTER_AUTH_TOKEN;

  if (!twilioAccountSid || !twilioAuthToken) {
    console.warn("[VAPI Sync] Cannot reconfigure Twilio webhook — missing credentials");
    return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://driftai.studio";

  try {
    // List Twilio incoming phone numbers to find the SID
    const listRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64")}`,
        },
      }
    );

    if (!listRes.ok) {
      console.error("[VAPI Sync] Failed to list Twilio numbers:", await listRes.text());
      return;
    }

    const listData = await listRes.json();
    const numbers = listData.incoming_phone_numbers;

    if (!numbers || numbers.length === 0) {
      console.warn(`[VAPI Sync] Phone number ${phoneNumber} not found in Twilio`);
      return;
    }

    const phoneSid = numbers[0].sid;

    // Update the webhook URL back to our custom endpoint
    const updateRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers/${phoneSid}.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          VoiceUrl: `${appUrl}/api/twilio/incoming`,
          VoiceMethod: "POST",
          StatusCallback: `${appUrl}/api/twilio/status`,
          StatusCallbackMethod: "POST",
        }).toString(),
      }
    );

    if (updateRes.ok) {
      console.log(`[VAPI Sync] Reconfigured Twilio webhook for ${phoneNumber} → custom endpoint`);
    } else {
      console.error("[VAPI Sync] Failed to update Twilio webhook:", await updateRes.text());
    }
  } catch (err) {
    console.error("[VAPI Sync] Error reconfiguring Twilio webhook:", err);
  }
}

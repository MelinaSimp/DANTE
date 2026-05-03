// SMS agent runner.
//
// Wraps the existing lib/dante/agent.ts runAgent loop with SMS-
// specific framing: channel-aware system prompt, recent sms_messages
// as conversation history, the user's inbound text as the objective.
//
// The runAgent inside is the SAME agent the web app uses — same
// tools, same memory, same audit trail. Texted "remember Aaron's
// deadline is March 15" stores in dante_memory; the web Dante can
// surface it later. That's the whole point of doing this in-process
// instead of as a separate microservice.

import { runAgent } from "@/lib/dante/agent";

// Lightweight uuid helper (avoids the uuid package dependency).
function uuidv4(): string {
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  // Fallback — RFC4122 v4
  const hex = [...Array(36)].map((_, i) => {
    if (i === 8 || i === 13 || i === 18 || i === 23) return "-";
    if (i === 14) return "4";
    const r = Math.floor(Math.random() * 16);
    if (i === 19) return ((r & 0x3) | 0x8).toString(16);
    return r.toString(16);
  });
  return hex.join("");
}
import { remember } from "@/lib/dante/memory/write";
import { logAuditEvent } from "@/lib/audit/log";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AgentStep, AgentToolEntry, StepLogEntry } from "@/lib/dante/workflow-types";
import { buildSmsSystemPrompt } from "./system-prompt";

interface SmsAgentInput {
  workspaceId: string;
  userId: string;
  phone: string;
  body: string;
  industry: string | null;
  assistantName: string;
  userName: string | null;
  workspaceName: string | null;
  userTimezone?: string;
}

interface SmsAgentResult {
  reply: string;
  agentRunId: string;
  truncated: boolean;
  steps_taken: number;
}

const SMS_TOOLS: AgentToolEntry[] = [
  "memory.search",
  "memory.write",
  "archive.search",
  "vault.cite",
  "clients.query",
  "skill.run",
  "reminder.schedule",
];

const HISTORY_TURNS = 20;

export async function runSmsAgent(input: SmsAgentInput): Promise<SmsAgentResult> {
  const agentRunId = uuidv4();

  // 1. Pull recent conversation as context
  const { data: recent } = await supabaseAdmin
    .from("sms_messages")
    .select("direction, body, created_at")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_TURNS);

  const history = ((recent || []) as Array<{
    direction: string;
    body: string;
    created_at: string;
  }>)
    .reverse()
    .map((r) => `[${r.direction === "inbound" ? "User" : input.assistantName}] ${r.body}`)
    .join("\n");

  // 2. Persist the inbound message + write a memory episode so the
  //    web app's chat surface sees it too. Memory write is best-effort
  //    so a failure here doesn't block the agent run.
  await supabaseAdmin.from("sms_messages").insert({
    workspace_id: input.workspaceId,
    user_id: input.userId,
    phone: input.phone,
    direction: "inbound",
    body: input.body,
    agent_run_id: agentRunId,
  });
  remember({
    workspaceId: input.workspaceId,
    kind: "episode",
    sourceKind: "sms",
    sourceId: agentRunId,
    content: `User texted: ${input.body}`,
  }).catch((err) => console.error("[sms.agent] memory write inbound failed:", err));

  // 3. Build the AgentStep — inject current UTC time so reminder.schedule
  // and any other time-sensitive tool gets a real timestamp anchor
  // instead of having the model guess from training data.
  const nowIso = new Date().toISOString();
  const timeNote = `\n\n---\n\nCurrent UTC time: ${nowIso}\nUse this as your anchor for any "now"-relative or "in X minutes/hours/days" computation. Do not guess the time from your training data.`;
  const systemPrompt =
    buildSmsSystemPrompt({
      industry: input.industry,
      assistantName: input.assistantName,
      userName: input.userName,
      workspaceName: input.workspaceName,
      userTimezone: input.userTimezone,
    }) + timeNote;

  const objective =
    history.length > 0
      ? `Recent conversation history (most recent last):
${history}

The latest user text just arrived. Respond to it.`
      : `The user just texted: "${input.body}". Respond.`;

  const step: AgentStep = {
    id: `sms_${agentRunId.slice(0, 8)}`,
    type: "agent",
    config: {
      model: "gpt-5",
      system: systemPrompt,
      objective,
      tools: SMS_TOOLS,
      max_steps: 8,
    },
  };

  const log: StepLogEntry[] = [];

  // 4. Run the agent
  let result;
  try {
    result = await runAgent({
      step,
      workspaceId: input.workspaceId,
      // SMS sender's user identity is in the input — pass it through
      // so reminder.schedule (and any future "self"-aware tool) can
      // resolve who's texting. Without this, the agent would refuse
      // to schedule reminders requested via SMS.
      userId: input.userId,
      simulate: false,
      runId: agentRunId,
      log,
    });
  } catch (err: any) {
    console.error("[sms.agent] runAgent threw:", err?.message, err?.stack);
    // Persist the failure into sms_messages so we can debug from Supabase
    // when CLI log streaming is unreliable.
    await supabaseAdmin
      .from("sms_messages")
      .insert({
        workspace_id: input.workspaceId,
        user_id: input.userId,
        phone: input.phone,
        direction: "outbound",
        body: "[agent error fallback]",
        agent_run_id: agentRunId,
        metadata: {
          error: String(err?.message || err),
          stack: String(err?.stack || "").slice(0, 4000),
        },
      })
      .then(() => null, () => null);
    return {
      reply:
        "Hit a snag on my end — try again in a minute? If it keeps happening, the team gets pinged automatically.",
      agentRunId,
      truncated: false,
      steps_taken: 0,
    };
  }

  const reply = (result.text || "").trim() ||
    "I'm here, but I didn't have anything to say to that. What do you need?";

  // 5. Persist the outbound message + memory episode
  await supabaseAdmin.from("sms_messages").insert({
    workspace_id: input.workspaceId,
    user_id: input.userId,
    phone: input.phone,
    direction: "outbound",
    body: reply,
    agent_run_id: agentRunId,
  });
  remember({
    workspaceId: input.workspaceId,
    kind: "episode",
    sourceKind: "sms",
    sourceId: agentRunId,
    content: `${input.assistantName} replied: ${reply}`,
  }).catch((err) => console.error("[sms.agent] memory write outbound failed:", err));

  // 6. Audit
  await logAuditEvent({
    action: "sms.agent.turn",
    actorUserId: input.userId,
    workspaceId: input.workspaceId,
    entityType: "sms_message",
    entityId: agentRunId,
    metadata: {
      phone: input.phone,
      inbound_chars: input.body.length,
      outbound_chars: reply.length,
      steps_taken: result.steps_taken,
      truncated: result.truncated,
    },
  }).catch(() => {});

  return {
    reply,
    agentRunId,
    truncated: result.truncated,
    steps_taken: result.steps_taken,
  };
}

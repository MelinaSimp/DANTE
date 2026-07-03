// lib/dante/agent-architect.ts
//
// The "Build by Chatting" engine. Given a conversation transcript, it
// asks the LLM to (a) reply conversationally and (b) emit its best
// current AgentBlueprint as JSON. Each turn is stateless: the caller
// owns the transcript, so the same input reproduces the same output
// (modulo model sampling). The blueprint is always re-validated here —
// the model's own `ready` claim is never trusted over validation.

import { complete } from "@/lib/llm/client";
import { GENERIC_SKILLS, GENERIC_TOOLS } from "./agent-catalog";
import {
  DEFAULT_AGENT_MODEL,
  validateBlueprint,
  type AgentBlueprint,
} from "./agent-blueprint";

export interface ArchitectMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RunArchitectTurnInput {
  transcript: ArchitectMessage[];
  workspaceId: string;
}

export interface ArchitectTurnResult {
  reply: string;
  blueprint: AgentBlueprint;
  blueprintErrors: string[];
  ready: boolean;
}

function catalogForPrompt(): string {
  const tools = GENERIC_TOOLS.map((t) => `  - ${t.id}: ${t.description}`).join("\n");
  const skills = GENERIC_SKILLS.map((s) => `  - ${s.slug}: ${s.description}`).join("\n");
  return `AVAILABLE TOOLS (suggest only ids from this list):\n${tools}\n\nAVAILABLE SKILLS (suggest only slugs from this list):\n${skills}`;
}

const SYSTEM_PROMPT = `You are the Agent Architect inside Dante, a platform where anyone builds AI agents for their business without code. Your job: interview the user briefly and design their agent.

On EVERY turn you output ONLY a single JSON object, no prose outside it, with this exact shape:
{
  "reply": "a short, friendly message to show the user — acknowledge what you learned and, if anything essential is missing, ask ONE clarifying question",
  "ready": true | false,
  "blueprint": {
    "name": "short agent name",
    "description": "one sentence on what the agent does",
    "persona": "the agent's full system prompt — identity, tone, boundaries, and escalation rules, written in the second person ('You are...')",
    "first_message": "the agent's opening greeting to an end user",
    "model": "claude-haiku-4-5 | claude-sonnet-4-6 | claude-opus-4-7",
    "skills": ["skill_slug", ...],
    "tools": ["tool.id", ...]
  }
}

Rules:
- Always return your best CURRENT blueprint, even if partial. Improve it each turn as you learn more.
- Set "ready" to true only when name and persona are solid and you have nothing essential left to ask.
- Suggest tools and skills ONLY from the catalog below. Never invent ids.
- Default the model to claude-sonnet-4-6 unless the task is trivial (haiku) or demands deep reasoning (opus).
- Keep "reply" to 1-3 sentences. Ask at most ONE question per turn.

${catalogForPrompt()}`;

function safeParse(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function runArchitectTurn(
  input: RunArchitectTurnInput,
): Promise<ArchitectTurnResult> {
  const result = await complete({
    model: DEFAULT_AGENT_MODEL,
    temperature: 0.4,
    responseFormat: { type: "json_object" },
    feature: "agent.architect",
    workspaceId: input.workspaceId,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...input.transcript.map((m) => ({ role: m.role, content: m.content })),
    ],
  });

  const content = typeof result.message.content === "string" ? result.message.content : "";
  const parsed = safeParse(content);

  if (!parsed) {
    // Model didn't emit JSON. Show its text (or a fallback) and keep going.
    const { blueprint } = validateBlueprint({});
    return {
      reply:
        content.trim() ||
        "Sorry, I didn't catch that. Can you describe what you want your agent to do?",
      blueprint,
      blueprintErrors: ["Agent needs a name.", "Agent needs a persona (system prompt)."],
      ready: false,
    };
  }

  const { ok, blueprint, errors } = validateBlueprint(parsed.blueprint);
  const reply =
    typeof parsed.reply === "string" && parsed.reply.trim()
      ? parsed.reply.trim()
      : "Tell me more about what this agent should do.";
  const modelReady = parsed.ready === true;

  return {
    reply,
    blueprint,
    blueprintErrors: errors,
    // Never let the model claim ready over a failing validation.
    ready: modelReady && ok,
  };
}

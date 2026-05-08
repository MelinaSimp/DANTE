// lib/agents/managed-agent.ts
//
// Adapter that runs one turn against an Anthropic Managed Agent and
// surfaces the result through a callback shaped like Drift's existing
// AgentEvent stream — so /api/dante/deep-research and the future
// /api/dante/web-scrape can serve the same SSE protocol the chat
// surface already speaks. The chat UI (streamClient.tsx) doesn't
// need any changes.
//
// Lifecycle:
//   1. Create a session against (agentId, environmentId).
//   2. Open the streaming events listener.
//   3. Send the user.message.
//   4. Iterate stream events:
//        • agent.tool_use      → emit tool_start (Drift event)
//        • agent.tool_result   → emit tool_end
//        • agent.message       → buffer text
//        • session.error       → throw
//        • session.status_terminated → finish, return final text + usage
//   5. Resolve with the accumulated assistant text.
//
// Notes:
//   • We use a fresh session per turn. Drift's chat history lives
//     in our own DB; we don't lean on the managed-agent thread for
//     history continuity, which keeps each call statelessly
//     reproducible and avoids a dangling-session leak.
//   • The session's recurring billing ($0.08/hr) only accrues while
//     the session is alive. We delete the session when the turn
//     finishes (best-effort; the runtime auto-reaps anyway).

import Anthropic from "@anthropic-ai/sdk";
import { computeCostCents } from "@/lib/dante/model-router";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface ManagedAgentEvent {
  /** Drift-shaped event names for compatibility with the chat SSE adapter. */
  type: "tool_start" | "tool_end" | "text_delta" | "iteration_thinking";
  /** Free text payload — for text_delta this is the new chunk; for thinking this is the agent's narration. */
  text?: string;
  /** Tool name when type is tool_start/tool_end. */
  tool_name?: string;
  /** Tool input (start) or output (end), already JSON-serialized. */
  payload?: unknown;
  /** Stable subscriber-friendly id pairing tool_start with its tool_end. */
  sub_id?: string;
}

export interface ManagedAgentResult {
  /** Final concatenated assistant text. */
  text: string;
  /** Number of agent.tool_use events seen — useful for cost analytics. */
  tool_calls: number;
  /** True when the session reached session.status_terminated cleanly. */
  completed: boolean;
}

export interface RunManagedAgentTurnInput {
  agentId: string;
  environmentId: string;
  /** The end-user's question / prompt for this turn. */
  userText: string;
  /** Streaming sink for partial results. May be sync or async. */
  onEvent?: (event: ManagedAgentEvent) => void | Promise<void>;
  /** Optional hard cap on wall-clock seconds; default 240s. */
  timeoutSeconds?: number;
  /** Workspace this run bills to. When set, the helper writes a row
   *  into dante_usage_ledger after the session terminates so the
   *  UsageBanner + admin surfaces account for managed-agent spend
   *  alongside chat spend. Without it, the call still works but is
   *  invisible to the metering. */
  workspaceId?: string;
  /** Feature tag for the ledger row — e.g. 'deep_research', 'web_scrape'. */
  feature?: string;
  /** Model used to bill against, since the agent itself is what knows
   *  its model (we configured both at agent_011…NonPC1eQn… etc with
   *  claude-sonnet-4-6). The helper trusts the caller to pass the
   *  right id; if omitted we default to Sonnet 4.6. */
  model?: string;
}

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  return new Anthropic({ apiKey });
}

export async function runManagedAgentTurn(
  input: RunManagedAgentTurnInput,
): Promise<ManagedAgentResult> {
  const client = getClient();
  const timeoutMs = (input.timeoutSeconds ?? 240) * 1000;
  const deadline = Date.now() + timeoutMs;

  // Session creation. environment_id is required; the managed runtime
  // attaches a fresh thread automatically when the first event lands.
  const session = (await client.beta.sessions.create({
    agent: input.agentId,
    environment_id: input.environmentId,
  } as unknown as Anthropic.Beta.SessionCreateParams)) as unknown as { id: string };

  const sessionId = session.id;

  // Send the user message. The session is now running.
  await client.beta.sessions.events.send(sessionId, {
    events: [
      {
        type: "user.message",
        content: [{ type: "text", text: input.userText }],
      },
    ],
  } as unknown as Anthropic.Beta.Sessions.EventSendParams);

  // Open the event stream. Iterate until session terminates.
  const stream = (await client.beta.sessions.events.stream(
    sessionId,
  )) as unknown as AsyncIterable<Record<string, unknown>>;

  let buffered = "";
  let toolCalls = 0;
  let completed = false;

  try {
    for await (const evt of stream) {
      if (Date.now() > deadline) {
        throw new Error(`Managed agent turn exceeded ${input.timeoutSeconds ?? 240}s`);
      }

      const t = (evt as { type?: string }).type;
      if (!t) continue;

      switch (t) {
        case "agent.message": {
          // Aggregate text blocks into the buffer + emit delta event.
          const content = (evt as { content?: Array<{ type?: string; text?: string }> }).content || [];
          for (const block of content) {
            if (block.type === "text" && typeof block.text === "string") {
              buffered += block.text;
              if (input.onEvent) {
                await input.onEvent({ type: "text_delta", text: block.text });
              }
            }
          }
          break;
        }
        case "agent.thinking": {
          const blocks = (evt as { content?: Array<{ type?: string; text?: string }> }).content || [];
          const text = blocks
            .filter((b) => b.type === "text")
            .map((b) => b.text || "")
            .join("");
          if (text && input.onEvent) {
            await input.onEvent({ type: "iteration_thinking", text });
          }
          break;
        }
        case "agent.tool_use":
        case "agent.mcp_tool_use":
        case "agent.custom_tool_use": {
          toolCalls += 1;
          const e = evt as { id?: string; name?: string; input?: unknown };
          if (input.onEvent) {
            await input.onEvent({
              type: "tool_start",
              tool_name: e.name || t,
              payload: e.input,
              sub_id: e.id,
            });
          }
          break;
        }
        case "agent.tool_result":
        case "agent.mcp_tool_result": {
          const e = evt as { tool_use_id?: string; name?: string; content?: unknown };
          if (input.onEvent) {
            await input.onEvent({
              type: "tool_end",
              tool_name: e.name || t,
              payload: e.content,
              sub_id: e.tool_use_id,
            });
          }
          break;
        }
        case "session.error": {
          const e = evt as { error?: { message?: string }; message?: string };
          throw new Error(
            `Managed agent session error: ${e.error?.message || e.message || "unknown"}`,
          );
        }
        case "session.status_terminated": {
          completed = true;
          break;
        }
      }

      if (completed) break;
    }
  } finally {
    // Pull the session's cumulative token usage BEFORE deleting it so
    // we can ledger the run. The session.retrieve response carries
    // BetaManagedAgentsSessionUsage on the .usage field — input,
    // output, and cache breakdowns rolled up across every internal
    // model call the agent made.
    if (input.workspaceId) {
      try {
        const final = (await (
          client.beta.sessions as unknown as {
            retrieve: (id: string) => Promise<{ usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } } }>;
          }
        ).retrieve(sessionId)) as { usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } } };
        const u = final.usage || {};
        const cacheCreate =
          (u.cache_creation?.ephemeral_5m_input_tokens || 0) +
          (u.cache_creation?.ephemeral_1h_input_tokens || 0);
        const inputTokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + cacheCreate;
        const outputTokens = u.output_tokens || 0;
        const cachedInputTokens = u.cache_read_input_tokens || 0;
        const model = input.model || "claude-sonnet-4-6";
        const cost_cents = computeCostCents(model, {
          inputTokens,
          cachedInputTokens,
          outputTokens,
        });
        // Fire-and-forget ledger write. Failures here can't break the
        // chat — the agent already returned successfully.
        void supabaseAdmin
          .from("dante_usage_ledger")
          .insert({
            workspace_id: input.workspaceId,
            model,
            input_tokens: inputTokens,
            cached_input_tokens: cachedInputTokens,
            output_tokens: outputTokens,
            cost_cents,
            feature: input.feature ?? "managed_agent",
          })
          .then((res) => {
            if (res.error) {
              console.error("[managed-agent] ledger insert failed:", res.error.message);
            }
          });
      } catch (e) {
        console.warn("[managed-agent] usage retrieve failed (no ledger row written):", e instanceof Error ? e.message : e);
      }
    }

    // Best-effort session cleanup. The runtime auto-reaps anyway, but
    // calling delete shortens the billing window for fast-running
    // turns where we're already done before idle reaping kicks in.
    try {
      await (client.beta.sessions as unknown as { delete: (id: string) => Promise<unknown> })
        .delete(sessionId);
    } catch {
      /* non-fatal — session expires on its own */
    }
  }

  return { text: buffered, tool_calls: toolCalls, completed };
}

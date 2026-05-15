// lib/llm/providers/anthropic.ts
//
// Anthropic implementation of LlmProvider. Uses the @anthropic-ai/sdk
// because the message translation has enough edge cases (mixed text +
// tool_use content blocks, system prompt extraction, tool result
// blocks, prompt caching) that hand-rolling against fetch makes the
// bug-surface bigger than the SDK's overhead.
//
// Provider-neutral seam preserved: callers continue importing
// { complete } from lib/llm/client.ts; the router dispatches here
// when opts.model starts with "claude-". This file does NOT implement
// embed() or transcribe() — Anthropic offers neither, and our
// pgvector index is dimension-locked at 1536 (text-embedding-3-small).
// Both methods throw with a message pointing the caller at OpenAI.
//
// Prompt caching is wired by default: every system prompt gets a
// cache_control: ephemeral marker (5-minute TTL) on its last block,
// and tool definitions are cached as a group. That captures most of
// the savings (~75% reduction on input tokens for chat turns where
// the system prompt + tools are static across requests).

import Anthropic from "@anthropic-ai/sdk";
import type {
  LlmCompleteOptions,
  LlmCompleteResult,
  LlmEmbedOptions,
  LlmMessage,
  LlmProvider,
  LlmToolCall,
  LlmToolDef,
  LlmTranscribeOptions,
} from "../types";

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  return new Anthropic({ apiKey, timeout: 120_000 });
}

// ── Message translation ──────────────────────────────────────────
//
// Drift's LlmMessage shape mirrors OpenAI's chat completions API.
// Anthropic's API uses:
//   • A top-level `system` string (or array of content blocks).
//   • A messages array of {role: "user"|"assistant", content}.
//   • content can be a string OR an array of typed blocks
//     (text / tool_use / tool_result / image).
//
// Two translations live here:
//   1. toAnthropicInput()  — LlmMessage[] → { system, messages }
//   2. fromAnthropicResponse() — Anthropic message → LlmMessage
//      with text + tool_calls in the OpenAI shape callers expect.

interface AnthropicTextBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}
interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}
interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}
type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;

interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicContentBlock[];
}

function toAnthropicInput(messages: LlmMessage[]): {
  system: AnthropicTextBlock[] | undefined;
  messages: AnthropicMessage[];
} {
  const systemBlocks: AnthropicTextBlock[] = [];
  const out: AnthropicMessage[] = [];

  // Pending assistant text + tool_use blocks merge into a single
  // assistant message so Drift's "assistant says X then calls tool Y"
  // turn becomes Anthropic's standard mixed-content assistant message.
  // A consecutive sequence of "tool" role messages becomes a single
  // user message with multiple tool_result blocks.

  for (const m of messages) {
    if (m.role === "system") {
      const text = m.content ?? "";
      if (text) systemBlocks.push({ type: "text", text });
      continue;
    }

    if (m.role === "user") {
      const text = m.content ?? "";
      if (text) {
        out.push({ role: "user", content: [{ type: "text", text }] });
      }
      continue;
    }

    if (m.role === "assistant") {
      const blocks: AnthropicContentBlock[] = [];
      if (m.content) {
        blocks.push({ type: "text", text: m.content });
      }
      for (const tc of m.tool_calls ?? []) {
        let parsedInput: Record<string, unknown> = {};
        try {
          parsedInput = tc.function.arguments
            ? (JSON.parse(tc.function.arguments) as Record<string, unknown>)
            : {};
        } catch {
          parsedInput = { _raw: tc.function.arguments };
        }
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: parsedInput,
        });
      }
      if (blocks.length > 0) out.push({ role: "assistant", content: blocks });
      continue;
    }

    if (m.role === "tool") {
      // Tool results land as user messages with a tool_result block.
      // Coalesce with the previous turn if it was already a tool_result
      // user message — Anthropic prefers grouped results from the same
      // assistant turn.
      const block: AnthropicToolResultBlock = {
        type: "tool_result",
        tool_use_id: m.tool_call_id ?? "",
        content: m.content ?? "",
      };
      const prev = out[out.length - 1];
      if (
        prev &&
        prev.role === "user" &&
        Array.isArray(prev.content) &&
        prev.content.every((c) => c.type === "tool_result")
      ) {
        prev.content.push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
      continue;
    }
  }

  // Apply prompt caching to the LAST system block — caches everything
  // up through it, ~5-minute TTL. Tool definitions are cached separately
  // (see toAnthropicTools below).
  if (systemBlocks.length > 0) {
    systemBlocks[systemBlocks.length - 1].cache_control = { type: "ephemeral" };
  }

  return {
    system: systemBlocks.length > 0 ? systemBlocks : undefined,
    messages: out,
  };
}

interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
  cache_control?: { type: "ephemeral" };
}

function toAnthropicTools(tools: LlmToolDef[] | undefined): AnthropicTool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  const out: AnthropicTool[] = tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
  // Cache the tool definitions as a group — same TTL as the system
  // prompt, but a separate cache key. Marking the last tool's
  // cache_control caches the whole tools array up through it.
  out[out.length - 1].cache_control = { type: "ephemeral" };
  return out;
}

interface AnthropicResponseMessage {
  id: string;
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

function fromAnthropicResponse(resp: AnthropicResponseMessage): LlmCompleteResult {
  let text = "";
  const toolCalls: LlmToolCall[] = [];

  for (const block of resp.content) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        },
      });
    }
  }

  const message: LlmMessage = {
    role: "assistant",
    content: text || null,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  };

  // Translate Anthropic stop_reason → OpenAI-shaped finish_reason so
  // call sites that switch on this don't need to know which provider
  // served them.
  const finishReason = (() => {
    switch (resp.stop_reason) {
      case "end_turn": return "stop";
      case "tool_use": return "tool_calls";
      case "max_tokens": return "length";
      case "stop_sequence": return "stop";
      default: return resp.stop_reason ?? "stop";
    }
  })();

  // promptTokens reports the *uncached* input + cache reads + cache
  // writes summed, mirroring OpenAI's prompt_tokens. The model-router
  // ledger row pulls cache breakdown separately via the `raw` field.
  const cacheRead = resp.usage.cache_read_input_tokens ?? 0;
  const cacheWrite = resp.usage.cache_creation_input_tokens ?? 0;
  return {
    message,
    finishReason,
    usage: {
      promptTokens: resp.usage.input_tokens + cacheRead + cacheWrite,
      completionTokens: resp.usage.output_tokens,
      totalTokens:
        resp.usage.input_tokens + cacheRead + cacheWrite + resp.usage.output_tokens,
    },
    raw: resp,
  };
}

// ── Provider ─────────────────────────────────────────────────────

class AnthropicProvider implements LlmProvider {
  readonly id = "anthropic";

  async complete(opts: LlmCompleteOptions): Promise<LlmCompleteResult> {
    const client = getClient();
    const { system, messages } = toAnthropicInput(opts.messages);
    const tools = toAnthropicTools(opts.tools);

    // Anthropic requires max_tokens. Default to a sensible cap that
    // matches OpenAI's typical default and avoids tiny truncation
    // surprises when callers don't specify one.
    const maxTokens = opts.maxTokens ?? 4096;

    // tool_choice translation — Anthropic's API uses a different shape.
    let toolChoice: { type: "auto" | "any" | "tool"; name?: string } | undefined;
    if (opts.toolChoice === "required") {
      toolChoice = { type: "any" };
    } else if (opts.toolChoice === "none") {
      toolChoice = undefined; // omit entirely; "none" is implicit when no tools attached
    } else if (
      typeof opts.toolChoice === "object" &&
      opts.toolChoice?.type === "function"
    ) {
      toolChoice = { type: "tool", name: opts.toolChoice.function.name };
    } else if (tools) {
      toolChoice = { type: "auto" };
    }

    // JSON mode: Anthropic doesn't have a response_format flag. The
    // standard workaround is to instruct via the system prompt; if a
    // caller asked for JSON mode, prepend a strict instruction to the
    // system content. Most callers also already prompt for JSON
    // explicitly, so this is a belt-and-suspenders nudge.
    let systemForRequest = system;
    if (opts.responseFormat?.type === "json_object") {
      const jsonNudge: AnthropicTextBlock = {
        type: "text",
        text: "Respond with a single valid JSON object and nothing else. No markdown fences, no prose before or after.",
      };
      systemForRequest = system ? [...system, jsonNudge] : [jsonNudge];
      // Preserve cache_control on the previous last block; mark the
      // nudge as the new cache anchor.
      if (systemForRequest.length >= 2) {
        delete systemForRequest[systemForRequest.length - 2].cache_control;
      }
      systemForRequest[systemForRequest.length - 1].cache_control = { type: "ephemeral" };
    }

    const request: Record<string, unknown> = {
      model: opts.model,
      max_tokens: maxTokens,
      messages,
    };
    if (systemForRequest) request.system = systemForRequest;
    if (tools) request.tools = tools;
    if (toolChoice) request.tool_choice = toolChoice;
    if (opts.temperature !== undefined) request.temperature = opts.temperature;

    // SDK call. The SDK throws on non-2xx with rich error info we
    // want to bubble up unchanged so the caller's existing error
    // handling continues to work.
    const resp = (await client.messages.create(
      request as unknown as Anthropic.Messages.MessageCreateParamsNonStreaming,
    )) as unknown as AnthropicResponseMessage;

    const result = fromAnthropicResponse(resp);

    if (!result.message.content && (!result.message.tool_calls || result.message.tool_calls.length === 0)) {
      console.warn(
        `[anthropic] empty response: model=${opts.model} stop_reason=${resp.stop_reason} ` +
        `input_tokens=${resp.usage?.input_tokens} output_tokens=${resp.usage?.output_tokens} ` +
        `content_blocks=${resp.content?.length ?? 0} feature=${opts.feature ?? "?"}`,
      );
    }

    return result;
  }

  async embed(_opts: LlmEmbedOptions): Promise<number[][]> {
    throw new Error(
      "Anthropic does not provide embeddings. Embeddings continue to use OpenAI's text-embedding-3-small (1536 dims, matches our pgvector schema). Route via the openai provider directly.",
    );
  }

  async transcribe(_opts: LlmTranscribeOptions): Promise<{ text: string }> {
    throw new Error(
      "Anthropic does not provide audio transcription. Continue using OpenAI's Whisper. Route via the openai provider directly.",
    );
  }
}

export const anthropicProvider: LlmProvider = new AnthropicProvider();

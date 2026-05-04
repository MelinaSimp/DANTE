// lib/llm/types.ts
//
// Shared LLM types used by the adapter in lib/llm/client.ts. Every
// route that wants to talk to a model imports from here, never from
// the OpenAI SDK directly. That gives us a single seam to swap
// providers, add Claude as a fallback, or fan out to a routing layer
// without touching every call site.

export type LlmRole = "system" | "user" | "assistant" | "tool";

export interface LlmToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface LlmMessage {
  role: LlmRole;
  content: string | null;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface LlmToolDef {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export type LlmToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type: "function"; function: { name: string } };

export interface LlmCompleteOptions {
  model: string;
  messages: LlmMessage[];
  tools?: LlmToolDef[];
  toolChoice?: LlmToolChoice;
  responseFormat?: { type: "text" } | { type: "json_object" };
  temperature?: number;
  maxTokens?: number;
  /** Free-form tag forwarded to telemetry so we can segment costs by feature. */
  feature?: string;
  /** Workspace context for telemetry / future per-tenant routing. */
  workspaceId?: string | null;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmCompleteResult {
  message: LlmMessage;
  finishReason: string;
  usage: LlmUsage;
  /** Raw provider response, kept for debugging / telemetry. */
  raw: unknown;
}

export interface LlmEmbedOptions {
  /** Default: text-embedding-3-small (1536 dims). */
  model?: string;
  input: string | string[];
}

export interface LlmTranscribeOptions {
  audio: Blob;
  /** Default: whisper-1. */
  model?: string;
  language?: string;
}

/**
 * Provider-neutral seam — every backend implements this interface,
 * lib/llm/client.ts dispatches to whichever the workspace / env
 * config selects. Today only the OpenAI provider exists; the seam
 * exists so adding Anthropic, Gemini, or a vLLM endpoint is a new
 * file plus a router entry, not a refactor of every call site.
 *
 * Why now: the panel review of Harvey called out their move from
 * OpenAI-exclusive to multi-model orchestration as the structural
 * insurance against any one provider's pricing/deprecation moves.
 * We don't ship a second provider in the same change — we land the
 * interface so the second one is a 2-day add later, not a 3-week
 * refactor.
 */
export interface LlmProvider {
  /** Provider identifier — "openai", "anthropic", etc. Used by
   *  telemetry and the (future) router to log which backend served
   *  a call. */
  readonly id: string;

  complete(opts: LlmCompleteOptions): Promise<LlmCompleteResult>;
  embed(opts: LlmEmbedOptions): Promise<number[][]>;
  transcribe(opts: LlmTranscribeOptions): Promise<{ text: string }>;
}

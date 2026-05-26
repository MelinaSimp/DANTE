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

/** Content block types for multi-modal messages (text + images). */
export interface LlmTextBlock {
  type: "text";
  text: string;
}

export interface LlmImageBlock {
  type: "image";
  /** Base64-encoded image data (no data-URL prefix). */
  data: string;
  /** MIME type — "image/png", "image/jpeg", "image/gif", "image/webp". */
  media_type: string;
}

export type LlmContentBlock = LlmTextBlock | LlmImageBlock;

export interface LlmMessage {
  role: LlmRole;
  /** Plain string for text-only messages, or an array of content
   *  blocks for multi-modal messages (e.g. text + images). */
  content: string | null | LlmContentBlock[];
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
  /** Pre-resolved processing mode (Hermes integration, Phase 1).
   *  When set to 'local_only', getProvider() returns the Hermes
   *  provider instead of the cloud default. Callers compute this
   *  via resolveProcessingMode() in lib/llm/processing-mode.ts. */
  processingMode?: "cloud" | "local_only";
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Response message — content is always a plain string or null.
 *  Content block arrays only appear in *input* messages (user
 *  messages with images), never in LLM responses. */
export interface LlmResponseMessage {
  role: LlmRole;
  content: string | null;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface LlmCompleteResult {
  message: LlmResponseMessage;
  finishReason: string;
  usage: LlmUsage;
  /** Raw provider response, kept for debugging / telemetry. */
  raw: unknown;
}

/**
 * Safely extract the text content from an LlmMessage. Returns the
 * string content if it's a plain string, concatenates text blocks if
 * it's a content block array, or returns the fallback for null.
 * Use this instead of casting `message.content` to string.
 */
export function llmContentText(
  content: string | null | LlmContentBlock[],
  fallback = "",
): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b): b is LlmTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
  return fallback;
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

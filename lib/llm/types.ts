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

// lib/llm/client.ts
//
// The single seam between Drift and any LLM provider. Every chat
// completion, embedding, and transcription request flows through
// here — not through `openai.chat.completions.create` directly, not
// through raw `fetch("https://api.openai.com/...")`. This keeps the
// surface small enough that swapping providers, adding a Claude
// fallback, or routing per-vertical becomes a localized change.
//
// Today the adapter is OpenAI-only. The shape of the public API
// (`complete`, `embed`, `transcribe`) deliberately uses provider-
// neutral names so a future Anthropic / Gemini / vLLM backend can be
// added behind a `provider` config without touching call sites.
//
// Telemetry note: token usage is returned on every call. Call sites
// that care about per-feature cost attribution should pass a
// `feature` tag — we surface it on the result so a caller (or a
// middleware) can persist `usage_events` rows without re-deriving
// context.

import type {
  LlmCompleteOptions,
  LlmCompleteResult,
  LlmEmbedOptions,
  LlmTranscribeOptions,
} from "./types";

const OPENAI_BASE = "https://api.openai.com/v1";

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  return key;
}

/**
 * Non-streaming chat completion. Tool-use, JSON mode, temperature,
 * max_tokens — all optional. The agent loop in lib/dante/agent.ts
 * calls this in a `while (stepIdx < maxSteps)` loop, dispatching
 * tools between iterations.
 */
export async function complete(
  opts: LlmCompleteOptions,
): Promise<LlmCompleteResult> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
  };
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
    // tool_choice="auto" is the default — explicit when caller asked.
    body.tool_choice = opts.toolChoice ?? "auto";
  } else if (opts.toolChoice) {
    body.tool_choice = opts.toolChoice;
  }
  if (opts.responseFormat) body.response_format = opts.responseFormat;
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`LLM ${res.status}: ${errBody.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    choices: Array<{ message: LlmCompleteResult["message"]; finish_reason: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const choice = json.choices?.[0];
  if (!choice) throw new Error("LLM returned no choices");

  return {
    message: choice.message,
    finishReason: choice.finish_reason ?? "stop",
    usage: {
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      totalTokens: json.usage?.total_tokens ?? 0,
    },
    raw: json,
  };
}

/**
 * Text embeddings. Default model is `text-embedding-3-small` (1536
 * dims) — matches the pgvector column in dante_archive_chunks /
 * dante_memory. Returns one vector per input string in input order.
 *
 * Batches are the caller's problem (the OpenAI cap is 2048 inputs
 * per call); embed.ts batches at 96 to stay conservative.
 */
export async function embed(opts: LlmEmbedOptions): Promise<number[][]> {
  const inputs = Array.isArray(opts.input) ? opts.input : [opts.input];
  if (inputs.length === 0) return [];

  const res = await fetch(`${OPENAI_BASE}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: opts.model ?? "text-embedding-3-small",
      input: inputs,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`LLM embed ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data.map((d) => d.embedding);
}

/**
 * Whisper transcription. Used by the Twilio Media Streams pipeline.
 * Caller hands us a Blob (typically a synthesized WAV from PCM) and
 * we hand back the recognized text.
 */
export async function transcribe(
  opts: LlmTranscribeOptions,
): Promise<{ text: string }> {
  const form = new FormData();
  form.append("file", opts.audio, "audio.wav");
  form.append("model", opts.model ?? "whisper-1");
  if (opts.language) form.append("language", opts.language);

  const res = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getApiKey()}` },
    body: form,
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`LLM transcribe ${res.status}: ${errBody.slice(0, 200)}`);
  }

  return (await res.json()) as { text: string };
}

/** Default embedding dim — exported so callers can validate vectors. */
export const EMBED_DIMS = 1536;

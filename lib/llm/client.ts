// lib/llm/client.ts
//
// The single seam between Drift and any LLM provider. Every chat
// completion, embedding, and transcription request flows through
// here — not through `openai.chat.completions.create` directly, not
// through raw `fetch("https://api.openai.com/...")`. This keeps the
// surface small enough that swapping providers, adding a Claude
// fallback, or routing per-vertical becomes a localized change.
//
// As of the post-Harvey-panel sprint, this file is now a *router*:
// it picks an LlmProvider implementation (today only the OpenAI
// one) and forwards. The provider-specific HTTP lives in
// lib/llm/providers/*.ts. Call sites continue importing
// { complete, embed, transcribe } from this file unchanged.
//
// Why the seam: the deep dive on Harvey's 2026 architecture
// confirmed they moved off OpenAI-exclusive in May 2025 and now
// route across Anthropic / OpenAI / Gemini. The structural risk of
// any single provider hiking prices, deprecating models, or
// changing terms is real, and Harvey paid the price to insure
// against it. Drift is doing the same insurance — but we ship the
// interface today and the second backend later, so the swap is
// 2 days of work instead of 3 weeks.
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
  LlmProvider,
  LlmTranscribeOptions,
} from "./types";
import { openaiProvider } from "./providers/openai";
import { hermesProvider } from "./providers/hermes";

interface ProviderSelectorOpts {
  model?: string;
  workspaceId?: string | null;
  /** Pre-resolved processing mode from lib/llm/processing-mode.ts.
   *  When set to 'local_only' the router returns the Hermes
   *  provider regardless of model name. The caller is responsible
   *  for resolving the mode (workspace → contact → doc → chat
   *  hierarchy); this router just honors the result. */
  processingMode?: "cloud" | "local_only";
}

/**
 * Returns the LlmProvider that should serve this call.
 *
 * Routing today:
 *   1. Explicit processingMode='local_only' → HermesProvider
 *      (local Ollama). This is the path that bypasses Drift
 *      servers entirely IN PRODUCTION (when the call originates
 *      in the Electron app's renderer, not Vercel — see Phase 2
 *      of the Hermes roadmap). The server-side stub here exists
 *      for development / self-hosted Ollama configurations.
 *   2. Default → OpenAIProvider.
 *
 * Future routing logic lands here:
 *   • if (opts?.model?.startsWith("claude")) → anthropicProvider
 *   • if (opts?.model?.startsWith("gemini")) → geminiProvider
 *   • Per-workspace config column for preferred cloud provider
 *
 * Callers pass `processingMode` from resolveProcessingMode() in
 * lib/llm/processing-mode.ts. Most callers shouldn't think about
 * this — the agent loop and brief generator pass it through
 * automatically.
 */
export function getProvider(opts?: ProviderSelectorOpts): LlmProvider {
  if (opts?.processingMode === "local_only") {
    return hermesProvider;
  }
  return openaiProvider;
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
  const provider = getProvider({
    model: opts.model,
    workspaceId: opts.workspaceId ?? null,
    processingMode: opts.processingMode,
  });
  return provider.complete(opts);
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
  const provider = getProvider({ model: opts.model });
  return provider.embed(opts);
}

/**
 * Whisper transcription. Used by the Twilio Media Streams pipeline.
 * Caller hands us a Blob (typically a synthesized WAV from PCM) and
 * we hand back the recognized text.
 */
export async function transcribe(
  opts: LlmTranscribeOptions,
): Promise<{ text: string }> {
  const provider = getProvider({ model: opts.model });
  return provider.transcribe(opts);
}

/** Default embedding dim — exported so callers can validate vectors. */
export const EMBED_DIMS = 1536;

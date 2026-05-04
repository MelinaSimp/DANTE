// lib/llm/providers/hermes.ts
//
// HermesProvider — local-only LLM via Ollama, running on the
// user's machine. Implements LlmProvider so it slots into the
// router in lib/llm/client.ts without changing call sites.
//
// IMPORTANT — architecture note:
//
//   This provider is the SERVER-SIDE half of the local-only
//   pipeline. It exists so:
//     (a) developers can run Ollama on their dev machine and
//         test the routing logic end-to-end against the real
//         interface contract.
//     (b) workspaces that have a self-hosted Ollama instance
//         reachable from Vercel (rare; would require a tunnel)
//         can use it.
//
//   For PRODUCTION local-only mode (the threat model where
//   Drift servers must NOT see content), the Electron app
//   provides its own client-side LlmProvider implementation
//   that talks to Ollama directly from the renderer. That
//   path bypasses Vercel entirely. See:
//     • Phase 2.10 — Electron-side LlmProvider in the roadmap
//     • lib/llm/processing-mode.ts — where the routing decision
//       is made
//
// Why ship the server-side stub now: the LlmProvider interface
// contract has to be identical between server-side and client-
// side implementations. Building the server stub first locks the
// contract; the Electron-side implementation in Phase 2 mirrors
// it field-for-field.
//
// Default model: hermes3:8b (NousResearch's Hermes 3, Llama 3.1
// 8B fine-tune). Q4_K_M quant is the right default for an M-series
// Mac — fits in 6GB RAM, runs at ~50 tok/s on M2 Pro. Workspaces
// can override via env or per-call.
//
// Endpoint: http://localhost:11434/api/chat (Ollama default).
// Override via HERMES_BASE_URL when running Ollama elsewhere.

import type {
  LlmCompleteOptions,
  LlmCompleteResult,
  LlmEmbedOptions,
  LlmMessage,
  LlmProvider,
  LlmTranscribeOptions,
} from "../types";

const HERMES_BASE_URL = process.env.HERMES_BASE_URL || "http://localhost:11434";
const HERMES_DEFAULT_MODEL = process.env.HERMES_DEFAULT_MODEL || "hermes3:8b";
const HERMES_DEFAULT_EMBED_MODEL =
  process.env.HERMES_DEFAULT_EMBED_MODEL || "nomic-embed-text";

/** Translates LlmMessage[] to the shape Ollama expects. Ollama's
 *  /api/chat is close to OpenAI's chat-completions schema but with
 *  small differences: no `name` field, tool_calls live differently. */
function toOllamaMessages(messages: LlmMessage[]): Array<{
  role: string;
  content: string;
}> {
  return messages
    .filter((m) => m.role !== "tool") // Ollama tool-use is non-standard; we don't expose it via Hermes today
    .map((m) => ({
      role: m.role,
      content: m.content || "",
    }));
}

class HermesProvider implements LlmProvider {
  readonly id = "hermes";

  async complete(opts: LlmCompleteOptions): Promise<LlmCompleteResult> {
    const model = mapModel(opts.model);
    const body: Record<string, unknown> = {
      model,
      messages: toOllamaMessages(opts.messages),
      stream: false,
    };
    if (opts.temperature !== undefined) {
      body.options = { temperature: opts.temperature };
    }
    // Ollama doesn't support OpenAI-style response_format, but it
    // does honor a "format: 'json'" option for forcing JSON output.
    // Map opts.responseFormat?.type === "json_object" to that.
    if (opts.responseFormat?.type === "json_object") {
      body.format = "json";
    }
    if (opts.tools && opts.tools.length > 0) {
      // Ollama tool-use exists but is model-specific and shape-
      // different from OpenAI's. For Phase 1 we don't expose tool
      // calling via Hermes; the routing layer ensures tool-using
      // calls go to OpenAI. If a caller passes tools here anyway,
      // log loudly and proceed without — better to degrade visibly
      // than silently miss tool calls.
      console.warn(
        "[hermes] tool calls passed to local provider — Hermes does not expose OpenAI-compatible tool-use; ignoring",
      );
    }

    const res = await ollamaFetch("/api/chat", body);
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(
        `Hermes ${res.status}: ${
          errBody.slice(0, 200) || "(no body — is Ollama running?)"
        }`,
      );
    }

    const json = (await res.json()) as {
      message?: { role: string; content: string };
      prompt_eval_count?: number;
      eval_count?: number;
      done_reason?: string;
    };

    if (!json.message) {
      throw new Error("Hermes returned no message");
    }

    return {
      message: {
        role: "assistant",
        content: json.message.content || "",
      },
      finishReason: json.done_reason ?? "stop",
      usage: {
        promptTokens: json.prompt_eval_count ?? 0,
        completionTokens: json.eval_count ?? 0,
        totalTokens: (json.prompt_eval_count ?? 0) + (json.eval_count ?? 0),
      },
      raw: json,
    };
  }

  async embed(opts: LlmEmbedOptions): Promise<number[][]> {
    const inputs = Array.isArray(opts.input) ? opts.input : [opts.input];
    if (inputs.length === 0) return [];
    const model = opts.model ?? HERMES_DEFAULT_EMBED_MODEL;

    // Ollama's embeddings endpoint is per-input — no batch shape
    // like OpenAI. Issue requests sequentially; small enough volume
    // for local usage that this is fine, and it pressures the
    // caller toward the right mental model (local is slower; batch
    // your work).
    const out: number[][] = [];
    for (const input of inputs) {
      const res = await ollamaFetch("/api/embeddings", { model, prompt: input });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(
          `Hermes embed ${res.status}: ${errBody.slice(0, 200) || "(is Ollama running?)"}`,
        );
      }
      const json = (await res.json()) as { embedding?: number[] };
      if (!json.embedding) throw new Error("Hermes embed: no embedding returned");
      out.push(json.embedding);
    }
    return out;
  }

  async transcribe(_opts: LlmTranscribeOptions): Promise<{ text: string }> {
    // Ollama doesn't ship a Whisper-equivalent endpoint. Local
    // transcription would require whisper.cpp bundled separately;
    // out of Phase 1 scope. Throw clearly so callers understand.
    throw new Error(
      "Hermes (Ollama) does not support transcription. Use the OpenAI provider for audio transcription, or wait for Phase 4 (whisper.cpp bundled in the Electron app).",
    );
  }
}

/** Map cloud model names to local equivalents. Callers don't have
 *  to change their model param when routing to local — "gpt-4o"
 *  routes to hermes3:8b, "gpt-4o-mini" routes to hermes3:3b, etc.
 *  Override per-call via opts.model if you need a specific local
 *  model. */
function mapModel(name: string): string {
  if (!name) return HERMES_DEFAULT_MODEL;
  const lower = name.toLowerCase();
  // If the caller passed an Ollama-shaped name through, use it
  // verbatim (e.g. "hermes3:70b", "llama3.1:8b").
  if (/^[a-z][a-z0-9._-]*:[a-z0-9._-]+$/i.test(lower)) return name;
  // Otherwise translate from common cloud names.
  if (lower.includes("mini") || lower.includes("haiku")) return "hermes3:3b";
  if (lower.includes("o3") || lower.includes("opus") || lower.includes("70b")) return "hermes3:70b";
  return HERMES_DEFAULT_MODEL;
}

async function ollamaFetch(path: string, body: unknown): Promise<Response> {
  return fetch(`${HERMES_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // Local LLMs are slower than cloud — give 60s budget per call,
    // generous compared to OpenAI's typical sub-10s but realistic
    // for a 70B model on a laptop.
    signal: AbortSignal.timeout(60_000),
  });
}

/**
 * Probe — best-effort check that Ollama is reachable and the
 * default Hermes model is pulled. Used by /api/me/local-mode to
 * tell the UI whether to show the privacy-mode toggle.
 */
export async function probeHermes(): Promise<{
  reachable: boolean;
  models_available: string[];
  hermes_pulled: boolean;
  base_url: string;
}> {
  try {
    const res = await fetch(`${HERMES_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(2_500),
    });
    if (!res.ok) {
      return {
        reachable: false,
        models_available: [],
        hermes_pulled: false,
        base_url: HERMES_BASE_URL,
      };
    }
    const json = (await res.json()) as {
      models?: Array<{ name: string }>;
    };
    const models = (json.models || []).map((m) => m.name);
    return {
      reachable: true,
      models_available: models,
      hermes_pulled: models.some((m) => m.toLowerCase().startsWith("hermes")),
      base_url: HERMES_BASE_URL,
    };
  } catch {
    return {
      reachable: false,
      models_available: [],
      hermes_pulled: false,
      base_url: HERMES_BASE_URL,
    };
  }
}

export const hermesProvider: LlmProvider = new HermesProvider();

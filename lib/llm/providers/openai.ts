// lib/llm/providers/openai.ts
//
// OpenAI implementation of LlmProvider. Lifted verbatim from the
// previous lib/llm/client.ts so this is a behavior-preserving
// refactor — call sites still see the same shape via the router in
// client.ts, this is just where the OpenAI-specific HTTP lives.
//
// Future siblings (anthropic.ts, gemini.ts, vllm.ts) implement the
// same LlmProvider interface and are wired in via getProvider() in
// client.ts.

import type {
  LlmCompleteOptions,
  LlmCompleteResult,
  LlmEmbedOptions,
  LlmProvider,
  LlmTranscribeOptions,
} from "../types";

const OPENAI_BASE = "https://api.openai.com/v1";

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  return key;
}

class OpenAIProvider implements LlmProvider {
  readonly id = "openai";

  async complete(opts: LlmCompleteOptions): Promise<LlmCompleteResult> {
    const body: Record<string, unknown> = {
      model: opts.model,
      messages: opts.messages,
    };
    if (opts.tools && opts.tools.length > 0) {
      body.tools = opts.tools;
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
      signal: AbortSignal.timeout(120_000),
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

  async embed(opts: LlmEmbedOptions): Promise<number[][]> {
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
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`LLM embed ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return json.data.map((d) => d.embedding);
  }

  async transcribe(opts: LlmTranscribeOptions): Promise<{ text: string }> {
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
}

export const openaiProvider: LlmProvider = new OpenAIProvider();

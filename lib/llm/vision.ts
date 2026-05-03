// lib/llm/vision.ts
//
// Phase 7 W7.4 — multi-modal input. Wraps the LLM adapter to send
// an image alongside text. Used by the photo-OCR path: a user
// snaps a photo of a paper disclosure form, drops it in chat, the
// agent reads + indexes it.
//
// Implementation: GPT-4o vision via OpenAI's content-array message
// shape. The LLM adapter is otherwise text-only; this file is the
// vision-specific extension. Stays here (not in client.ts) so the
// chat-only callers don't pay the type-complexity cost.

import { complete as llmComplete } from "./client";

export interface VisionAnalyzeInput {
  /** Public URL or data: URL of the image. */
  imageUrl: string;
  /** What to ask about the image. */
  prompt: string;
  /** Workspace context for telemetry. */
  workspaceId?: string;
  /** Optional: model override. Defaults to gpt-4o (vision-capable). */
  model?: string;
}

export interface VisionAnalyzeResult {
  text: string;
  /** Token usage (helpful for billing aggregator). */
  tokens: { promptTokens: number; completionTokens: number; totalTokens: number };
}

const DEFAULT_MODEL = "gpt-4o";

export async function analyzeImage(input: VisionAnalyzeInput): Promise<VisionAnalyzeResult> {
  // Wrap the user message as a vision-capable content array.
  // The LLM adapter's LlmMessage.content is `string | null`, so we
  // cheat with `as never` — the OpenAI API accepts the array shape.
  const content = [
    { type: "text", text: input.prompt },
    { type: "image_url", image_url: { url: input.imageUrl } },
  ] as never;

  const result = await llmComplete({
    model: input.model ?? DEFAULT_MODEL,
    messages: [{ role: "user", content }],
    feature: "vision.analyze",
    workspaceId: input.workspaceId,
    temperature: 0.2,
  });

  return {
    text: result.message.content ?? "",
    tokens: result.usage,
  };
}

/**
 * Convenience: extract structured data from a photographed form
 * (lease, disclosure, intake form). Returns either parsed JSON
 * or an error string.
 */
export async function extractFormFromImage(input: {
  imageUrl: string;
  workspaceId?: string;
  /** What fields to extract; rendered into the prompt. */
  fields: Array<{ key: string; description: string }>;
}): Promise<{ ok: true; data: Record<string, string | null> } | { ok: false; error: string }> {
  const fieldList = input.fields.map((f) => `- ${f.key}: ${f.description}`).join("\n");
  const prompt = `Extract the following fields from the image. Respond ONLY as JSON of shape { "<key>": "<value or null>" }.

Fields:
${fieldList}

Rules:
- If a field isn't visible or legible, use null.
- Don't invent values. Don't guess.
- Preserve exact text for things like names, addresses, dates.`;

  try {
    const result = await analyzeImage({
      imageUrl: input.imageUrl,
      prompt,
      workspaceId: input.workspaceId,
    });
    const cleaned = result.text.replace(/^```json\n?|\n?```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as Record<string, string | null>;
    return { ok: true, data: parsed };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "extract_failed",
    };
  }
}

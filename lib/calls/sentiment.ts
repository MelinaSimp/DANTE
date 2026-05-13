// Semantic sentiment classifier for call summaries.
//
// Previously Dante's sentiment signal was a keyword scan over
// call_recordings.summary ("frustrat", "angry"). Two failure modes:
//
//   - false negatives: client sounds upset without using flagged words
//   - false positives: summary quotes the keyword neutrally ("no concerns")
//
// This runs a small LLM classification pass on the call summary after
// the main summarizer finishes, and emits a signed score + label that
// Dante reads directly. Keyword fallback stays for legacy rows.
//
// Deliberately kept as a separate function rather than bolted onto
// summarizeCall(): the summarizer's prompt is stable (covered by evals),
// sentiment is a lightweight add-on, and failures here shouldn't affect
// the grounded summary.

import { complete as llmComplete } from "@/lib/llm/client";

export type SentimentLabel =
  | "positive"
  | "neutral"
  | "concerned"
  | "frustrated"
  | "angry";

export interface SentimentResult {
  score: number;          // [-1.0, +1.0]
  label: SentimentLabel;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

const LABEL_TO_SCORE: Record<SentimentLabel, number> = {
  positive: 0.8,
  neutral: 0.0,
  concerned: -0.3,
  frustrated: -0.6,
  angry: -0.9,
};

function buildPrompt(summary: string, contactName: string): string {
  return `Classify the emotional tone of the following financial-consultation call summary from the client's perspective. Output ONLY one JSON object, no prose.

{
  "label": "positive" | "neutral" | "concerned" | "frustrated" | "angry"
}

Guidelines:
- "positive" — client expressed satisfaction, excitement, or confidence
- "neutral" — informational exchange with no strong emotional signal
- "concerned" — client voiced unease, worry, or doubt, but remained engaged
- "frustrated" — client pushed back, was visibly annoyed, or complained
- "angry" — client threatened to leave, raised voice, or expressed hostility

Base your judgment on the client's words and tone as conveyed in the summary, not the consultant's. If the summary does not contain clear emotional signal, choose "neutral".

Client: ${contactName}

Call summary:
"""
${summary.slice(0, 4000)}
"""`;
}

function parseLabel(raw: string): SentimentLabel | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    const obj = JSON.parse(cleaned);
    if (typeof obj?.label === "string") {
      const lower = obj.label.toLowerCase().trim();
      if (lower in LABEL_TO_SCORE) return lower as SentimentLabel;
    }
  } catch {
    // Fall through to substring match — some models emit just the bare word.
  }
  const lower = raw.toLowerCase();
  for (const label of Object.keys(LABEL_TO_SCORE) as SentimentLabel[]) {
    if (lower.includes(`"${label}"`) || lower.includes(`'${label}'`) || lower.trim() === label) {
      return label;
    }
  }
  return null;
}

/**
 * Classify the sentiment of a call summary. Returns null if both API
 * keys are missing or all calls fail — callers should treat null as
 * "fall back to keyword heuristic" rather than an error.
 *
 * Cheap model by design: this is a single-label classification, not
 * a reasoning task. Haiku handles it fine and keeps the pipeline cost
 * roughly flat vs. the main summarizer call.
 */
export async function classifyCallSentiment(args: {
  summary: string;
  contactName: string;
}): Promise<SentimentResult | null> {
  const { summary, contactName } = args;
  if (!summary.trim()) return null;
  const prompt = buildPrompt(summary, contactName);

  let raw = "";
  const model = "claude-haiku-4-5-20251001";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const result = await llmComplete({
      model,
      temperature: 0,
      maxTokens: 50,
      responseFormat: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
      feature: "calls.sentiment",
    });
    raw = (typeof result.message.content === "string" ? result.message.content : "").trim();
    inputTokens = result.usage.promptTokens;
    outputTokens = result.usage.completionTokens;
  } catch (e) {
    console.error("[sentiment] classifier call failed:", e);
    return null;
  }

  if (!raw) return null;
  const label = parseLabel(raw);
  if (!label) return null;

  return {
    label,
    score: LABEL_TO_SCORE[label],
    model,
    inputTokens,
    outputTokens,
  };
}

// Shared summarizer for call transcripts.
//
// Used by both the live pipeline (app/api/calls/process/route.ts) and the
// eval harness (evals/call-summary/runner.ts). Keeping this in one place
// means the eval actually measures what production does — not a drifted
// copy of the prompt.
//
// Input: whisper-style segments + contact name + API keys.
// Output: a structured, verified summary + the raw LLM response + token usage.
//
// The verification pass (validateClaims) is the grounding gate — any claim
// whose cite_segments is empty or references a non-existent segment ID is
// dropped. This is the thing the eval harness grades.
//
// Dropping claims silently is deliberate: the remaining summary is always
// grounded, but we report verified_count / total_claims so the UI and the
// eval can see the gap.
//
import { complete as llmComplete } from "@/lib/llm/client";

// No Supabase/storage/Whisper here — just string in, string out. That makes
// it cheap to test in isolation.
export type TranscriptSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

export type StructuredClaim = {
  text: string;
  cite_segments: number[];
  owner?: string;
  deadline?: string | null;
};

export type StructuredSummary = {
  tldr: string;
  key_points: StructuredClaim[];
  action_items: StructuredClaim[];
  follow_ups: StructuredClaim[];
  verified_count: number;
  total_claims: number;
};

export type SummarizeResult = {
  structured: StructuredSummary | null;
  rawResponse: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  markdown: string;
};

export type SummarizeInput = {
  segments: TranscriptSegment[];
  transcript?: string; // fallback body if segments missing
  contactName: string;
  // Optional reference-library chunks retrieved out-of-band (see
  // lib/references/retrieve.ts). The eval harness leaves this empty
  // so scoring stays deterministic; the prod route fills it in based
  // on regulatory topics detected in the transcript.
  referenceContext?: string;
};

export function buildSummaryPrompt(
  segments: TranscriptSegment[],
  transcript: string,
  contactName: string,
  referenceContext?: string
): string {
  const segmentLines = segments.length
    ? segments
        .map(
          (s) =>
            `[${s.id}] (${s.start.toFixed(1)}s–${s.end.toFixed(1)}s) ${s.text}`
        )
        .join("\n")
    : transcript;

  const refBlock =
    referenceContext && referenceContext.trim()
      ? `\n${referenceContext.trim()}\n`
      : "";

  return `You are an AI assistant for a financial consultant. Below is a transcript of a call they just had with their client ${contactName}, broken into numbered segments. You MUST cite segment IDs for every claim you make — this is non-negotiable. Claims without citations will be discarded.

Return a JSON object with this exact shape (no markdown, no prose outside the JSON):

{
  "tldr": "2-3 sentences on what the call was about and the overall tone/outcome",
  "key_points": [
    { "text": "short bullet about a decision, goal, concern, or commitment", "cite_segments": [<segment_id>, ...] }
  ],
  "action_items": [
    { "text": "concrete follow-up", "owner": "Consultant" | "${contactName}" | "Unclear", "deadline": "string or null", "cite_segments": [<segment_id>, ...] }
  ],
  "follow_ups": [
    { "text": "unresolved item or thing to probe next time", "cite_segments": [<segment_id>, ...] }
  ]
}

Rules:
- Do not use emojis in any output. Plain text and standard punctuation only.
- Every key_point, action_item, and follow_up MUST include at least one segment ID from the transcript in cite_segments.
- Only cite segment IDs that actually support the claim. If you can't cite, omit the claim.
- Do not invent details not present in the transcript.
- Be concise. 3–7 key points, 0–5 action items, 0–4 follow-ups.
- tldr itself does not need citations — but every specific claim beyond the tldr must.
- If the REFERENCE CONTEXT below is present, use it to avoid regulatory errors (RMD age, contribution limits, IRMAA brackets). Do NOT put reference keys into cite_segments — those must be transcript IDs only.
${refBlock}
TRANSCRIPT SEGMENTS:
${segmentLines.slice(0, 24000)}`;
}

function cleanJsonBlob(s: string): string {
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fence ? fence[1] : s).trim();
}

// "Substantive" = alphabetic tokens of length ≥ 2. Strips emoji,
// punctuation, and one-letter tokens so a transcript of "[emoji] [emoji] Bye [emoji]"
// scores 1, not 4. Used to short-circuit the LLM when there's nothing
// to actually summarize.
export function countSubstantiveWords(
  segments: TranscriptSegment[],
  transcript: string
): number {
  const body =
    segments.length > 0 ? segments.map((s) => s.text).join(" ") : transcript;
  const matches = body.match(/[A-Za-z]{2,}/g);
  return matches ? matches.length : 0;
}

/** Under this many words, we skip the LLM and emit an honest stub. */
const SHORT_TRANSCRIPT_WORD_THRESHOLD = 10;

// Verification pass: reject claims that cite no segments or cite IDs that
// don't exist. This is the grounding gate — same logic the eval measures.
export function verifyStructured(
  parsed: any,
  segments: TranscriptSegment[]
): StructuredSummary {
  const validSegIds = new Set(segments.map((s) => s.id));

  const validateClaims = (arr: any): StructuredClaim[] => {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((c) => ({
        text: typeof c?.text === "string" ? c.text.trim() : "",
        owner: typeof c?.owner === "string" ? c.owner : undefined,
        deadline:
          typeof c?.deadline === "string" && c.deadline.trim()
            ? c.deadline.trim()
            : null,
        cite_segments: Array.isArray(c?.cite_segments)
          ? c.cite_segments
              .filter((n: unknown) => typeof n === "number")
              .filter((n: number) => validSegIds.has(n))
          : [],
      }))
      .filter((c) => c.text && c.cite_segments.length > 0);
  };

  const keyPoints = validateClaims(parsed.key_points);
  const actionItems = validateClaims(parsed.action_items);
  const followUps = validateClaims(parsed.follow_ups);

  const totalClaims =
    (Array.isArray(parsed.key_points) ? parsed.key_points.length : 0) +
    (Array.isArray(parsed.action_items) ? parsed.action_items.length : 0) +
    (Array.isArray(parsed.follow_ups) ? parsed.follow_ups.length : 0);
  const verifiedCount =
    keyPoints.length + actionItems.length + followUps.length;

  return {
    tldr: typeof parsed.tldr === "string" ? parsed.tldr.trim() : "",
    key_points: keyPoints,
    action_items: actionItems,
    follow_ups: followUps,
    verified_count: verifiedCount,
    total_claims: totalClaims,
  };
}

export function renderSummaryMarkdown(s: StructuredSummary): string {
  const citeStr = (ids: number[]) =>
    ids.length ? ` *[segments ${ids.join(", ")}]*` : "";
  const lines: string[] = [];
  if (s.tldr) lines.push(`## Summary\n${s.tldr}`);
  if (s.key_points.length) {
    lines.push(
      "",
      "## Key Points",
      ...s.key_points.map((p) => `- ${p.text}${citeStr(p.cite_segments)}`)
    );
  }
  if (s.action_items.length) {
    lines.push(
      "",
      "## Action Items",
      ...s.action_items.map(
        (a) =>
          `- **${a.owner || "Unclear"}**: ${a.text}${
            a.deadline ? ` (by ${a.deadline})` : ""
          }${citeStr(a.cite_segments)}`
      )
    );
  }
  if (s.follow_ups.length) {
    lines.push(
      "",
      "## Follow-up Questions",
      ...s.follow_ups.map((f) => `- ${f.text}${citeStr(f.cite_segments)}`)
    );
  }
  // Only show the verification footer when there was something to verify.
  // Empty-claim summaries (short transcripts, model skips) shouldn't
  // brag "0 / 0 grounded" — it's noise.
  if (s.total_claims > 0) {
    lines.push(
      "",
      `*Verified: ${s.verified_count} / ${s.total_claims} claims grounded in the transcript.*`
    );
  }
  return lines.join("\n");
}

export async function summarizeCall(
  input: SummarizeInput
): Promise<SummarizeResult> {
  const {
    segments,
    transcript = "",
    contactName,
    referenceContext,
  } = input;

  // Short-circuit before we spend tokens on a transcript that has
  // nothing to summarize. On empty/trivial audio the LLM happily
  // fabricates ("The call was brief and casual...") with zero
  // citations, which then renders as "0 / 0 grounded" — worse than
  // useless. Emit an honest stub instead.
  const wordCount = countSubstantiveWords(segments, transcript);
  if (wordCount < SHORT_TRANSCRIPT_WORD_THRESHOLD) {
    const tldr =
      wordCount === 0
        ? "No speech detected in this recording."
        : `Transcript too short to audit — ${wordCount} ${
            wordCount === 1 ? "word" : "words"
          } of content.`;
    const structured: StructuredSummary = {
      tldr,
      key_points: [],
      action_items: [],
      follow_ups: [],
      verified_count: 0,
      total_claims: 0,
    };
    return {
      structured,
      rawResponse: "",
      model: "none",
      inputTokens: 0,
      outputTokens: 0,
      markdown: renderSummaryMarkdown(structured),
    };
  }

  const prompt = buildSummaryPrompt(
    segments,
    transcript,
    contactName,
    referenceContext
  );

  let rawResponse = "";
  const model = "claude-haiku-4-5-20251001";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const result = await llmComplete({
      model,
      temperature: 0.2,
      maxTokens: 2000,
      responseFormat: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
      feature: "calls.summarize",
    });
    rawResponse = (typeof result.message.content === "string" ? result.message.content : "").trim();
    inputTokens = result.usage.promptTokens;
    outputTokens = result.usage.completionTokens;
  } catch {
    // fall through — rawResponse empty
  }

  let structured: StructuredSummary | null = null;
  if (rawResponse) {
    try {
      const parsed = JSON.parse(cleanJsonBlob(rawResponse));
      structured = verifyStructured(parsed, segments);
    } catch {
      // leave structured null
    }
  }

  const markdown = structured
    ? renderSummaryMarkdown(structured)
    : rawResponse ||
      "_(Summary generation failed — raw transcript preserved below.)_";

  return { structured, rawResponse, model, inputTokens, outputTokens, markdown };
}

// Topic-level engagement analysis for call transcripts.
//
// We don't have speaker diarization yet (Whisper emits a single text
// stream), so we infer client engagement from response patterns:
//   - length and depth of replies when the advisor raises a topic
//   - questions vs. acknowledgements
//   - hesitation markers vs. confirmation markers
//   - topic-adjacent follow-ups in later segments
//
// Output is structured so the UI can highlight segment IDs for each
// topic and Dante can fire per-topic churn events.
//
// Grounding: each topic must cite at least one segment ID. Topics
// that don't cite get dropped — same anti-hallucination pattern as
// the main summarizer.

export type TranscriptSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

export type InterestLevel = "high" | "medium" | "low";

export type TopicEngagement = {
  topic: string;
  interest: InterestLevel;
  evidence: string;
  segment_ids: number[];
};

export type EngagementResult = {
  overall_interest: number; // 0-100
  topics: TopicEngagement[];
  model: string;
  inputTokens: number;
  outputTokens: number;
};

function buildPrompt(
  segments: TranscriptSegment[],
  transcript: string,
  contactName: string
): string {
  const segmentLines = segments.length
    ? segments
        .map(
          (s) =>
            `[${s.id}] (${s.start.toFixed(1)}s) ${s.text}`
        )
        .join("\n")
    : transcript;

  return `You are analyzing a financial-consultation call transcript to gauge the client ${contactName}'s engagement and interest on a per-topic basis. You have NO audio — infer from language only.

Identify 2-6 distinct topics that came up. For each, rate the client's apparent interest as "high", "medium", or "low" based on:
  - length & depth of their responses on that topic
  - questions they asked vs. one-word acknowledgements ("ok", "sure", "mmhm")
  - hesitation / deflection ("I'll think about it", silence, topic changes) → lower
  - direct follow-ups or emotional investment ("that's exactly what I need", specifics about their life) → higher

Also compute an overall_interest score 0-100 summarizing the client's engagement across the whole call.

Return ONLY this JSON, no prose:

{
  "overall_interest": 0-100,
  "topics": [
    {
      "topic": "short label, e.g. 'Roth conversion', '529 plan', 'concerns about volatility'",
      "interest": "high" | "medium" | "low",
      "evidence": "one sentence citing client behavior that justifies the rating",
      "segment_ids": [<id>, ...]
    }
  ]
}

Rules:
- Every topic MUST include at least one segment_id where that topic was discussed. Topics without citations will be discarded.
- Only rate what's actually there. If the client barely spoke, say so via low overall_interest and a single "general check-in" topic.
- Base ratings on the CLIENT's words, not the advisor's. The advisor can be enthusiastic while the client is checked out.

TRANSCRIPT SEGMENTS:
${segmentLines.slice(0, 20000)}`;
}

function cleanJsonBlob(s: string): string {
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fence ? fence[1] : s).trim();
}

function verify(
  parsed: any,
  segments: TranscriptSegment[]
): Omit<EngagementResult, "model" | "inputTokens" | "outputTokens"> {
  const validIds = new Set(segments.map((s) => s.id));
  const rawTopics = Array.isArray(parsed?.topics) ? parsed.topics : [];
  const topics: TopicEngagement[] = rawTopics
    .map((t: any) => {
      const interest = String(t?.interest || "").toLowerCase();
      const levelOk: InterestLevel | null =
        interest === "high" || interest === "medium" || interest === "low"
          ? (interest as InterestLevel)
          : null;
      const segIds = Array.isArray(t?.segment_ids)
        ? t.segment_ids
            .filter((n: unknown) => typeof n === "number")
            .filter((n: number) => validIds.has(n))
        : [];
      return {
        topic: typeof t?.topic === "string" ? t.topic.trim() : "",
        interest: levelOk,
        evidence: typeof t?.evidence === "string" ? t.evidence.trim() : "",
        segment_ids: segIds,
      };
    })
    .filter(
      (t: any) =>
        t.topic && t.interest && t.segment_ids.length > 0
    ) as TopicEngagement[];

  const rawOverall = Number(parsed?.overall_interest);
  const overall =
    Number.isFinite(rawOverall)
      ? Math.max(0, Math.min(100, Math.round(rawOverall)))
      : 50;

  return { overall_interest: overall, topics };
}

/**
 * Analyze topic-level engagement. Returns null if both API keys are
 * missing or every call fails — callers should treat null as "no
 * engagement data available" rather than an error.
 */
export async function analyzeEngagement(args: {
  segments: TranscriptSegment[];
  transcript: string;
  contactName: string;
  anthropicKey?: string;
  openaiKey?: string;
}): Promise<EngagementResult | null> {
  const { segments, transcript, contactName, anthropicKey, openaiKey } = args;
  if (!transcript.trim() && segments.length === 0) return null;

  const prompt = buildPrompt(segments, transcript, contactName);
  let raw = "";
  let model = "";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    if (anthropicKey) {
      model = "claude-haiku-4-5-20251001";
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          temperature: 0.1,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (r.ok) {
        const d = await r.json();
        raw = (d.content || [])
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text || "")
          .join("")
          .trim();
        inputTokens = d.usage?.input_tokens ?? 0;
        outputTokens = d.usage?.output_tokens ?? 0;
      }
    }
    if (!raw && openaiKey) {
      model = "gpt-4o-mini";
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 1500,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (r.ok) {
        const d = await r.json();
        raw = (d.choices?.[0]?.message?.content || "").trim();
        inputTokens = d.usage?.prompt_tokens ?? 0;
        outputTokens = d.usage?.completion_tokens ?? 0;
      }
    }
  } catch (e) {
    console.error("[engagement] analysis failed:", e);
    return null;
  }

  if (!raw) return null;

  let parsed: any;
  try {
    parsed = JSON.parse(cleanJsonBlob(raw));
  } catch {
    return null;
  }

  const { overall_interest, topics } = verify(parsed, segments);
  if (topics.length === 0) return null;

  return { overall_interest, topics, model, inputTokens, outputTokens };
}

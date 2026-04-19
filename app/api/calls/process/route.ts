// Transcribe + summarize + save to notes.
// Input: { recordingId, durationSeconds? }
// - Downloads the audio from Supabase Storage
// - Sends it to OpenAI Whisper (max 25 MB per file)
// - Feeds the transcript into an LLM summarizer
// - Appends one note to the contact with summary + full transcript
// - Updates call_recordings row with status=done and links to the note

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recordLlmUsage } from "@/lib/usage/track";

export const dynamic = "force-dynamic";
// Whisper can take 30–90s on long clips; give it headroom. Hobby caps this at
// 60s — user is on Pro so 300s is available.
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 24 * 1024 * 1024; // Whisper API limit is 25 MB

// Mark a recording as failed and return an error response.
async function fail(recordingId: string, code: number, message: string) {
  await supabaseAdmin
    .from("call_recordings")
    .update({ status: "error", error: message })
    .eq("id", recordingId);
  return NextResponse.json({ error: message }, { status: code });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const recordingId =
    typeof body.recordingId === "string" ? body.recordingId : "";
  const durationSeconds =
    typeof body.durationSeconds === "number" ? body.durationSeconds : null;
  if (!recordingId) {
    return NextResponse.json({ error: "recordingId required" }, { status: 400 });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY missing — transcription unavailable" },
      { status: 500 }
    );
  }

  // Load the recording row and verify ownership via RLS-backed select.
  const { data: rec, error: recErr } = await supabase
    .from("call_recordings")
    .select("id, workspace_id, contact_id, storage_path, status")
    .eq("id", recordingId)
    .maybeSingle();
  if (recErr || !rec) {
    return NextResponse.json(
      { error: "Recording not found or access denied" },
      { status: 404 }
    );
  }
  if (!rec.storage_path) {
    return fail(recordingId, 400, "No audio uploaded for this recording");
  }

  // Load contact name (for the note body header).
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, name")
    .eq("id", rec.contact_id)
    .maybeSingle();
  const contactName = contact?.name || "Client";

  await supabaseAdmin
    .from("call_recordings")
    .update({
      status: "transcribing",
      duration_seconds: durationSeconds ?? undefined,
    })
    .eq("id", recordingId);

  // Download audio from private bucket via service role.
  const { data: fileBlob, error: dlErr } = await supabaseAdmin.storage
    .from("call-recordings")
    .download(rec.storage_path);
  if (dlErr || !fileBlob) {
    return fail(
      recordingId,
      500,
      `Failed to download audio: ${dlErr?.message || "unknown"}`
    );
  }
  if (fileBlob.size > MAX_UPLOAD_BYTES) {
    return fail(
      recordingId,
      413,
      `Audio file too large (${(fileBlob.size / 1024 / 1024).toFixed(1)} MB). Whisper max is 25 MB — try shorter calls or lower the bitrate.`
    );
  }

  // Whisper transcription.
  const form = new FormData();
  form.append("file", fileBlob, "call.webm");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json"); // includes duration + segments

  type WhisperSegment = {
    id: number;
    start: number;
    end: number;
    text: string;
  };

  let transcript = "";
  let whisperDuration: number | null = null;
  let segments: WhisperSegment[] = [];
  try {
    const resp = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: form,
      }
    );
    if (!resp.ok) {
      const text = await resp.text();
      return fail(recordingId, 502, `Whisper error: ${text.slice(0, 300)}`);
    }
    const data = await resp.json();
    transcript = (data.text || "").trim();
    whisperDuration =
      typeof data.duration === "number" ? data.duration : null;
    // Keep only the fields we need — segment objects are stored in the DB.
    segments = Array.isArray(data.segments)
      ? data.segments.map((s: any) => ({
          id: typeof s.id === "number" ? s.id : 0,
          start: typeof s.start === "number" ? s.start : 0,
          end: typeof s.end === "number" ? s.end : 0,
          text: typeof s.text === "string" ? s.text.trim() : "",
        }))
      : [];
  } catch (e: any) {
    return fail(
      recordingId,
      500,
      `Whisper request failed: ${e?.message || "unknown"}`
    );
  }

  if (!transcript) {
    return fail(recordingId, 500, "Whisper returned an empty transcript");
  }

  // Summarization. Prefer Anthropic when set, else OpenAI.
  await supabaseAdmin
    .from("call_recordings")
    .update({
      status: "summarizing",
      transcript,
      transcript_segments: segments,
    })
    .eq("id", recordingId);

  // Present the transcript to the LLM as numbered segments so it can cite
  // each claim back to specific segment IDs. This is the grounding layer —
  // every bullet the model produces has to reference which segments it
  // extracted that claim from, otherwise we reject the claim later.
  const segmentLines = segments.length
    ? segments
        .map(
          (s) =>
            `[${s.id}] (${s.start.toFixed(1)}s–${s.end.toFixed(1)}s) ${s.text}`
        )
        .join("\n")
    : transcript; // fall back to plain transcript if segments missing

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const summaryPrompt = `You are an AI assistant for a financial consultant. Below is a transcript of a call they just had with their client ${contactName}, broken into numbered segments. You MUST cite segment IDs for every claim you make — this is non-negotiable. Claims without citations will be discarded.

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
- Every key_point, action_item, and follow_up MUST include at least one segment ID from the transcript in cite_segments.
- Only cite segment IDs that actually support the claim. If you can't cite, omit the claim.
- Do not invent details not present in the transcript.
- Be concise. 3–7 key points, 0–5 action items, 0–4 follow-ups.
- tldr itself does not need citations — but every specific claim beyond the tldr must.

TRANSCRIPT SEGMENTS:
${segmentLines.slice(0, 24000)}`;

  type StructuredClaim = {
    text: string;
    cite_segments: number[];
    owner?: string;
    deadline?: string | null;
  };
  type StructuredSummary = {
    tldr: string;
    key_points: StructuredClaim[];
    action_items: StructuredClaim[];
    follow_ups: StructuredClaim[];
    verified_count: number;
    total_claims: number;
  };

  let rawResponse = "";
  let sumModel = "";
  let sumInputTokens = 0;
  let sumOutputTokens = 0;

  try {
    if (anthropicKey) {
      sumModel = "claude-sonnet-4-5";
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: sumModel,
          max_tokens: 2000,
          temperature: 0.2,
          messages: [{ role: "user", content: summaryPrompt }],
        }),
      });
      if (r.ok) {
        const d = await r.json();
        rawResponse = (d.content || [])
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text || "")
          .join("")
          .trim();
        sumInputTokens = d.usage?.input_tokens ?? 0;
        sumOutputTokens = d.usage?.output_tokens ?? 0;
      }
    }
    if (!rawResponse) {
      sumModel = "gpt-4o-mini";
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: sumModel,
          temperature: 0.2,
          max_tokens: 2000,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: summaryPrompt }],
        }),
      });
      if (r.ok) {
        const d = await r.json();
        rawResponse = (d.choices?.[0]?.message?.content || "").trim();
        sumInputTokens = d.usage?.prompt_tokens ?? 0;
        sumOutputTokens = d.usage?.completion_tokens ?? 0;
      }
    }
  } catch {
    // fall through — rawResponse stays empty
  }

  // Parse structured JSON. Anthropic doesn't have a JSON mode, so trim any
  // markdown code fences the model might add.
  function cleanJsonBlob(s: string): string {
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    return (fence ? fence[1] : s).trim();
  }

  let structured: StructuredSummary | null = null;
  if (rawResponse) {
    try {
      const parsed = JSON.parse(cleanJsonBlob(rawResponse));
      const validSegIds = new Set(segments.map((s) => s.id));

      // Verification pass: reject claims that cite no segments, or cite
      // segment IDs that don't exist. This is the grounding gate.
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

      structured = {
        tldr: typeof parsed.tldr === "string" ? parsed.tldr.trim() : "",
        key_points: keyPoints,
        action_items: actionItems,
        follow_ups: followUps,
        verified_count: verifiedCount,
        total_claims: totalClaims,
      };
    } catch {
      // If parse fails, leave structured null and fall back to raw text.
    }
  }

  // Compose the human-readable markdown summary that goes into the note
  // body. If structured parse succeeded, render from that (keeping citations
  // inline as "[1,4]" markers). Otherwise fall back to the raw response.
  function renderSummaryMarkdown(s: StructuredSummary): string {
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
    lines.push(
      "",
      `*Verified: ${s.verified_count} / ${s.total_claims} claims grounded in the transcript.*`
    );
    return lines.join("\n");
  }

  let summary = "";
  if (structured) {
    summary = renderSummaryMarkdown(structured);
  } else if (rawResponse) {
    summary = rawResponse;
  } else {
    summary = "_(Summary generation failed — raw transcript preserved below.)_";
  }

  // Fire-and-forget usage metering for the summary call.
  if (sumInputTokens > 0 || sumOutputTokens > 0) {
    recordLlmUsage({
      workspaceId: rec.workspace_id,
      userId: user.id,
      model: sumModel,
      inputTokens: sumInputTokens,
      outputTokens: sumOutputTokens,
      source: "call_summary",
      metadata: { recordingId, contactId: rec.contact_id },
    });
  }

  // Compose the note body: human-readable header + summary + full transcript.
  const when = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const durationMin =
    durationSeconds ?? whisperDuration
      ? Math.round((durationSeconds ?? whisperDuration ?? 0) / 60)
      : null;
  const header = `📞 Call with ${contactName} — ${when}${
    durationMin ? ` (~${durationMin} min)` : ""
  }`;
  const noteBody = `${header}\n\n${summary}\n\n---\n\nFULL TRANSCRIPT\n${transcript}`;

  const { data: noteRow, error: noteErr } = await supabaseAdmin
    .from("notes")
    .insert({
      workspace_id: rec.workspace_id,
      contact_id: rec.contact_id,
      body: noteBody,
    })
    .select("id")
    .single();
  if (noteErr) {
    return fail(recordingId, 500, `Failed to save note: ${noteErr.message}`);
  }

  await supabaseAdmin
    .from("call_recordings")
    .update({
      status: "done",
      summary,
      summary_structured: structured ?? null,
      note_id: noteRow.id,
      completed_at: new Date().toISOString(),
      duration_seconds:
        durationSeconds ?? (Math.round(whisperDuration || 0) || null),
    })
    .eq("id", recordingId);

  return NextResponse.json({
    recordingId,
    noteId: noteRow.id,
    summary,
    structured,
    transcript,
    durationSeconds: durationSeconds ?? Math.round(whisperDuration || 0),
  });
}

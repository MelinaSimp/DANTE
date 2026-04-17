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

  let transcript = "";
  let whisperDuration: number | null = null;
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
    .update({ status: "summarizing", transcript })
    .eq("id", recordingId);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const summaryPrompt = `You are an AI assistant for a financial consultant. Below is a transcript of a call they just had with their client ${contactName}. Produce a concise, scannable summary in the following format:

## Summary
2–3 sentences on what the call was about and the overall tone/outcome.

## Key Points
- Bullet each significant topic, decision, client goal, concern, or commitment mentioned.

## Action Items
- Bullet each concrete follow-up with WHO owns it (Consultant vs ${contactName}) and, if mentioned, a deadline or timeframe.

## Follow-up Questions
- Any unresolved items or things worth probing in the next meeting.

Keep it under ~350 words total. Do not invent details not present in the transcript. If the transcript is too short or garbled to extract meaningful content, say so briefly.

TRANSCRIPT:
${transcript.slice(0, 24000)}`;

  let summary = "";
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
          max_tokens: 1500,
          temperature: 0.2,
          messages: [{ role: "user", content: summaryPrompt }],
        }),
      });
      if (r.ok) {
        const d = await r.json();
        summary = (d.content || [])
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text || "")
          .join("")
          .trim();
        sumInputTokens = d.usage?.input_tokens ?? 0;
        sumOutputTokens = d.usage?.output_tokens ?? 0;
      }
    }
    if (!summary) {
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
          max_tokens: 1500,
          messages: [{ role: "user", content: summaryPrompt }],
        }),
      });
      if (r.ok) {
        const d = await r.json();
        summary = (d.choices?.[0]?.message?.content || "").trim();
        sumInputTokens = d.usage?.prompt_tokens ?? 0;
        sumOutputTokens = d.usage?.completion_tokens ?? 0;
      }
    }
  } catch {
    // fall through — summary stays empty
  }
  if (!summary) {
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
    transcript,
    durationSeconds: durationSeconds ?? Math.round(whisperDuration || 0),
  });
}

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
import { summarizeCall } from "@/lib/calls/summarize";
import { classifyCallSentiment } from "@/lib/calls/sentiment";
import { scanForCompliance } from "@/lib/compliance/scan";
import {
  retrieveReferences,
  formatReferenceContext,
} from "@/lib/references/retrieve";
import { logChurnEvent } from "@/lib/dante/churn-events";

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

  // Reference-library retrieval — scan the transcript for regulatory
  // topics (RMD, IRMAA, contribution limits, etc.) and pull the most
  // relevant chunks from the ingested corpus. Failures here are
  // non-fatal: the summarizer still runs without the context, the
  // summary is just less protected from regulatory-fact drift.
  let referenceContext = "";
  let referenceRefs: Array<{ source_key: string; chunk_index: number }> = [];
  try {
    const chunks = await retrieveReferences(transcript);
    if (chunks.length > 0) {
      referenceContext = formatReferenceContext(chunks);
      referenceRefs = chunks.map((c) => ({
        source_key: c.source_key,
        chunk_index: c.chunk_index,
      }));
    }
  } catch (e) {
    console.error("reference retrieval failed for call", recordingId, e);
  }

  // Summarization — delegated to lib/calls/summarize so the eval harness
  // exercises the same code path. That lib handles the prompt, the model
  // fallback (Anthropic → OpenAI), JSON parsing, and the grounding pass
  // that drops claims without valid citations.
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const {
    structured,
    model: sumModel,
    inputTokens: sumInputTokens,
    outputTokens: sumOutputTokens,
    markdown: summary,
  } = await summarizeCall({
    segments,
    transcript,
    contactName,
    openaiKey,
    anthropicKey,
    referenceContext,
  });

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

  // Sentiment classification — feeds Dante's sentiment signal directly
  // (see lib/dante/churn.ts). Non-fatal: if the classifier fails the
  // row stays with null sentiment and Dante falls back to keywords.
  const sentiment = await classifyCallSentiment({
    summary,
    contactName,
    anthropicKey,
    openaiKey,
  });

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
      sentiment_score: sentiment?.score ?? null,
      sentiment_label: sentiment?.label ?? null,
    })
    .eq("id", recordingId);

  // Dante churn signal — a completed call is engagement. Long calls
  // (> 5 min) carry a bigger positive weight; include the generated
  // summary in metadata so a future sentiment pass can upgrade the
  // event type to agent_interaction_negative if warranted.
  if (rec.contact_id) {
    const totalSeconds = Math.round(durationSeconds ?? whisperDuration ?? 0);
    logChurnEvent({
      workspace_id: rec.workspace_id,
      contact_id: rec.contact_id,
      event_type: totalSeconds > 300 ? "call_completed_long" : "call_completed",
      source: "calls",
      source_id: recordingId,
      metadata: { duration_seconds: totalSeconds, note_id: noteRow.id },
    });
  }

  // Auto-run the compliance scanner on the generated summary. This is
  // the M1.5 end-to-end wiring: every saved summary gets scanned, flags
  // land in compliance_flags with source_type='call_summary' and
  // source_id=recordingId so the dashboard count + audit view pick them
  // up immediately. We intentionally don't block the response on scan
  // failures — if the LLM layer is slow the deterministic rules still
  // fire synchronously and land.
  let complianceFlags: Awaited<ReturnType<typeof scanForCompliance>>["flags"] = [];
  try {
    // Sticky dismissals: re-summarize of the same recording shouldn't
    // resurface a rule the user already dismissed for this call.
    const { data: existing } = await supabaseAdmin
      .from("compliance_flags")
      .select("rule_id, status")
      .eq("workspace_id", rec.workspace_id)
      .eq("source_type", "call_summary")
      .eq("source_id", recordingId);
    const dismissed = new Set(
      (existing || [])
        .filter((f: any) => f.status === "dismissed" && f.rule_id)
        .map((f: any) => f.rule_id as string)
    );

    const scan = await scanForCompliance({
      text: summary,
      contextLabel: `Call summary for ${contactName}`,
      anthropicKey,
    });
    const fresh = scan.flags.filter(
      (f) => !f.rule_id || !dismissed.has(f.rule_id)
    );
    complianceFlags = fresh;

    if (fresh.length > 0) {
      await supabaseAdmin.from("compliance_flags").insert(
        fresh.map((f) => ({
          workspace_id: rec.workspace_id,
          source_type: "call_summary",
          source_id: recordingId,
          scanned_text: summary,
          layer: f.layer,
          rule_id: f.rule_id,
          severity: f.severity,
          message: f.message,
          citation_refs: f.citations,
          status: "pending" as const,
        }))
      );

      // Dante churn signal — a "block"-severity compliance flag on a
      // client's call summary is a real churn risk (advisor misstep,
      // regulatory exposure, erosion of trust). Fires one event per
      // flag; the events pipeline's 30-day half-life decays them
      // naturally so a single hit won't permanently tank the score.
      if (rec.contact_id) {
        const blocks = fresh.filter((f) => f.severity === "block");
        for (const f of blocks) {
          logChurnEvent({
            workspace_id: rec.workspace_id,
            contact_id: rec.contact_id,
            event_type: "compliance_flag_high",
            source: "calls",
            source_id: recordingId,
            metadata: {
              rule_id: f.rule_id,
              layer: f.layer,
              message: f.message?.slice(0, 200),
            },
          });
        }
      }
    }
  } catch (e) {
    // Non-fatal: summary is saved, flags are best-effort. Log for
    // observability but don't fail the user-facing response.
    console.error("compliance scan failed for call", recordingId, e);
  }

  return NextResponse.json({
    recordingId,
    noteId: noteRow.id,
    summary,
    structured,
    transcript,
    complianceFlags,
    referenceRefs,
    durationSeconds: durationSeconds ?? Math.round(whisperDuration || 0),
  });
}

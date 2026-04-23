// Shared call-processing pipeline.
//
// Two entry points share this core:
//   1. app/api/calls/process/route.ts  — user-authenticated (browser recorder)
//   2. app/api/zoom/webhook/[workspaceId]/route.ts — service-auth (Zoom cloud)
//
// Contract: the caller has already created a `call_recordings` row with a
// populated `storage_path`, and is responsible for any upstream auth /
// billing gating. This function runs Whisper → summarize → notes → Dante
// and flips the row to `done` (or `error`) at the end.

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

const MAX_UPLOAD_BYTES = 24 * 1024 * 1024; // Whisper API limit is 25 MB

export type PipelineResult = {
  ok: true;
  recordingId: string;
  noteId: string;
  summary: string;
  structured: any;
  transcript: string;
  complianceFlags: any[];
  durationSeconds: number;
} | {
  ok: false;
  code: number;
  error: string;
};

async function fail(recordingId: string, code: number, message: string): Promise<PipelineResult> {
  await supabaseAdmin
    .from("call_recordings")
    .update({ status: "error", error: message })
    .eq("id", recordingId);
  return { ok: false, code, error: message };
}

export async function processRecording(opts: {
  recordingId: string;
  durationSeconds?: number | null;
  /** For usage-tracking attribution. Optional — Zoom path has no user. */
  userId?: string | null;
}): Promise<PipelineResult> {
  const { recordingId } = opts;
  const durationSeconds =
    typeof opts.durationSeconds === "number" ? opts.durationSeconds : null;

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return fail(recordingId, 500, "OPENAI_API_KEY missing — transcription unavailable");
  }

  const { data: rec, error: recErr } = await supabaseAdmin
    .from("call_recordings")
    .select("id, workspace_id, contact_id, storage_path, status")
    .eq("id", recordingId)
    .maybeSingle();
  if (recErr || !rec) {
    return { ok: false, code: 404, error: "Recording not found" };
  }
  if (!rec.storage_path) {
    return fail(recordingId, 400, "No audio uploaded for this recording");
  }

  const { data: contact } = await supabaseAdmin
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

  const { data: fileBlob, error: dlErr } = await supabaseAdmin.storage
    .from("call-recordings")
    .download(rec.storage_path);
  if (dlErr || !fileBlob) {
    return fail(recordingId, 500, `Failed to download audio: ${dlErr?.message || "unknown"}`);
  }
  if (fileBlob.size > MAX_UPLOAD_BYTES) {
    return fail(
      recordingId,
      413,
      `Audio file too large (${(fileBlob.size / 1024 / 1024).toFixed(1)} MB). Whisper max is 25 MB.`
    );
  }

  const form = new FormData();
  form.append("file", fileBlob, "call.webm");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");

  type WhisperSegment = { id: number; start: number; end: number; text: string };
  let transcript = "";
  let whisperDuration: number | null = null;
  let segments: WhisperSegment[] = [];
  try {
    const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    });
    if (!resp.ok) {
      const text = await resp.text();
      return fail(recordingId, 502, `Whisper error: ${text.slice(0, 300)}`);
    }
    const data = await resp.json();
    transcript = (data.text || "").trim();
    whisperDuration = typeof data.duration === "number" ? data.duration : null;
    segments = Array.isArray(data.segments)
      ? data.segments.map((s: any) => ({
          id: typeof s.id === "number" ? s.id : 0,
          start: typeof s.start === "number" ? s.start : 0,
          end: typeof s.end === "number" ? s.end : 0,
          text: typeof s.text === "string" ? s.text.trim() : "",
        }))
      : [];
  } catch (e: any) {
    return fail(recordingId, 500, `Whisper request failed: ${e?.message || "unknown"}`);
  }

  if (!transcript) {
    return fail(recordingId, 500, "Whisper returned an empty transcript");
  }

  await supabaseAdmin
    .from("call_recordings")
    .update({
      status: "summarizing",
      transcript,
      transcript_segments: segments,
    })
    .eq("id", recordingId);

  let referenceContext = "";
  try {
    const chunks = await retrieveReferences(transcript);
    if (chunks.length > 0) referenceContext = formatReferenceContext(chunks);
  } catch (e) {
    console.error("reference retrieval failed for call", recordingId, e);
  }

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

  if ((sumInputTokens > 0 || sumOutputTokens > 0) && opts.userId) {
    recordLlmUsage({
      workspaceId: rec.workspace_id,
      userId: opts.userId,
      model: sumModel,
      inputTokens: sumInputTokens,
      outputTokens: sumOutputTokens,
      source: "call_summary",
      metadata: { recordingId, contactId: rec.contact_id },
    });
  }

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

  let complianceFlags: Awaited<ReturnType<typeof scanForCompliance>>["flags"] = [];
  try {
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
    const fresh = scan.flags.filter((f) => !f.rule_id || !dismissed.has(f.rule_id));
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
    console.error("compliance scan failed for call", recordingId, e);
  }

  return {
    ok: true,
    recordingId,
    noteId: noteRow.id,
    summary,
    structured,
    transcript,
    complianceFlags,
    durationSeconds: durationSeconds ?? Math.round(whisperDuration || 0),
  };
}

// Zoom webhook — recording.completed handler.
//
// URL per workspace: /api/zoom/webhook/<workspace_id>
// We use the workspace_id in the path so each tenant configures its
// own dedicated webhook URL in Zoom's Marketplace, and we don't need
// to look it up by Zoom account — the signature we verify is
// scoped to that workspace's webhook_secret.
//
// Two events matter:
//   - endpoint.url_validation: respond with HMAC(plainToken)
//   - recording.completed: download the M4A/MP4, drop it in storage,
//     run the call pipeline

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto/secrets";
import {
  verifyZoomSignature,
  computeUrlValidationResponse,
} from "@/lib/zoom/webhook";
import { downloadRecordingFile } from "@/lib/zoom/client";
import { processRecording } from "@/lib/calls/process-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function loadWebhookSecret(workspaceId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("zoom_credentials")
    .select("webhook_secret")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data) return null;
  return decryptSecret(data.webhook_secret);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;

  const webhookSecret = await loadWebhookSecret(workspaceId);
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Zoom not configured for this workspace" },
      { status: 404 }
    );
  }

  // Read raw body — signature is computed over the exact bytes Zoom sent.
  const rawBody = await req.text();
  const timestamp = req.headers.get("x-zm-request-timestamp") || "";
  const signature = req.headers.get("x-zm-signature");

  if (!verifyZoomSignature(webhookSecret, timestamp, rawBody, signature)) {
    console.warn("[zoom/webhook] signature mismatch for workspace", workspaceId);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = payload.event;

  if (event === "endpoint.url_validation") {
    const plainToken = payload.payload?.plainToken;
    if (!plainToken) {
      return NextResponse.json({ error: "Missing plainToken" }, { status: 400 });
    }
    return NextResponse.json(
      computeUrlValidationResponse(webhookSecret, plainToken)
    );
  }

  if (event !== "recording.completed") {
    // Acknowledge other events so Zoom doesn't retry.
    return NextResponse.json({ ok: true, ignored: event });
  }

  const obj = payload.payload?.object;
  const downloadToken: string | undefined = payload.download_token;
  if (!obj || !downloadToken) {
    return NextResponse.json({ error: "Malformed recording payload" }, { status: 400 });
  }

  const meetingUuid: string = obj.uuid;
  const meetingId: number | string = obj.id;

  // Find the scheduled recording row we created when the meeting was made.
  // UUIDs are unique per meeting instance; preferred match. Fall back to
  // meeting_id only if the advisor started via Zoom-native entry.
  const { data: rec } = await supabaseAdmin
    .from("call_recordings")
    .select("id, contact_id, workspace_id")
    .eq("workspace_id", workspaceId)
    .or(
      `zoom_meeting_uuid.eq.${meetingUuid},zoom_meeting_id.eq.${String(meetingId)}`
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!rec) {
    console.warn("[zoom/webhook] no matching recording row for meeting", meetingId);
    return NextResponse.json({ ok: true, skipped: "no_matching_row" });
  }

  // Prefer M4A (audio-only, smaller). Fall back to MP4.
  const files: any[] = Array.isArray(obj.recording_files) ? obj.recording_files : [];
  const audioFile =
    files.find((f) => f.file_type === "M4A") ||
    files.find((f) => f.file_type === "MP4");
  if (!audioFile?.download_url) {
    await supabaseAdmin
      .from("call_recordings")
      .update({ status: "error", error: "Zoom sent no downloadable audio file" })
      .eq("id", rec.id);
    return NextResponse.json({ ok: true, skipped: "no_audio_file" });
  }

  const ext = audioFile.file_type === "M4A" ? "m4a" : "mp4";
  const storagePath = `${workspaceId}/${rec.id}.${ext}`;

  try {
    const buf = await downloadRecordingFile(audioFile.download_url, downloadToken);
    const { error: upErr } = await supabaseAdmin.storage
      .from("call-recordings")
      .upload(storagePath, Buffer.from(buf), {
        contentType: ext === "m4a" ? "audio/mp4" : "video/mp4",
        upsert: true,
      });
    if (upErr) throw upErr;
  } catch (err: any) {
    console.error("[zoom/webhook] download/upload failed:", err);
    await supabaseAdmin
      .from("call_recordings")
      .update({
        status: "error",
        error: `Failed to ingest Zoom recording: ${err?.message || "unknown"}`,
      })
      .eq("id", rec.id);
    return NextResponse.json({ ok: false, error: "ingest_failed" }, { status: 500 });
  }

  await supabaseAdmin
    .from("call_recordings")
    .update({
      storage_path: storagePath,
      status: "uploading",
      duration_seconds: typeof obj.duration === "number" ? obj.duration * 60 : null,
    })
    .eq("id", rec.id);

  // Run the pipeline synchronously — Zoom gives us 3s to ACK but their
  // retry policy is friendly (up to 3 retries over 24h). We have
  // maxDuration=300 to cover Whisper + summarize. If this is cutting it
  // close in practice, switch to a background queue (qstash/inngest).
  const result = await processRecording({
    recordingId: rec.id,
    durationSeconds: typeof obj.duration === "number" ? obj.duration * 60 : null,
    userId: null,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.code });
  }

  return NextResponse.json({ ok: true, recordingId: result.recordingId });
}

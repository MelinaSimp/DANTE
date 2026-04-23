// Transcribe + summarize + save to notes — browser recorder entry point.
//
// The heavy lifting lives in lib/calls/process-pipeline.ts so the Zoom
// webhook can reuse it. This route's job is:
//   - authenticate the caller
//   - confirm they own the recording row (RLS-backed select)
//   - delegate to processRecording()

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { processRecording } from "@/lib/calls/process-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

  // RLS-backed existence check: if the user can SELECT the row, they
  // own the workspace. The pipeline uses the admin client past this
  // gate, so we rely on this check for authorization.
  const { data: rec, error: recErr } = await supabase
    .from("call_recordings")
    .select("id")
    .eq("id", recordingId)
    .maybeSingle();
  if (recErr || !rec) {
    return NextResponse.json(
      { error: "Recording not found or access denied" },
      { status: 404 }
    );
  }

  const result = await processRecording({
    recordingId,
    durationSeconds,
    userId: user.id,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.code });
  }

  return NextResponse.json({
    recordingId: result.recordingId,
    noteId: result.noteId,
    summary: result.summary,
    structured: result.structured,
    transcript: result.transcript,
    complianceFlags: result.complianceFlags,
    durationSeconds: result.durationSeconds,
  });
}

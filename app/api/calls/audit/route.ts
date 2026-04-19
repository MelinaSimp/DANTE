// Fetch a call recording's audit data (transcript segments + structured
// summary) by note_id OR recording_id. Used by the CallAuditView modal
// when a user clicks "View audit" on a call note.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const noteId = url.searchParams.get("noteId");
  const recordingId = url.searchParams.get("recordingId");
  if (!noteId && !recordingId) {
    return NextResponse.json(
      { error: "noteId or recordingId required" },
      { status: 400 }
    );
  }

  // RLS on call_recordings scopes to workspace.
  const query = supabase
    .from("call_recordings")
    .select(
      "id, contact_id, transcript, transcript_segments, summary_structured, summary, created_at, completed_at, note_id"
    );

  const { data, error } = recordingId
    ? await query.eq("id", recordingId).maybeSingle()
    : await query.eq("note_id", noteId).maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ audit: data });
}

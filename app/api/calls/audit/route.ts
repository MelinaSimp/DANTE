// Fetch a call recording's audit data (transcript segments + structured
// summary + compliance flags) by note_id OR recording_id. Used by the
// CallAuditView modal when a user clicks "View audit" on a call note.
//
// Compliance flags are joined in so the audit modal can show a single
// "the AI's output on this call" view: claims with their citations,
// plus any FINRA/Reg BI flags raised by the auto-scan at save time.

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

  // Pull compliance flags tied to this recording. RLS scopes to
  // workspace. Pending + approved are shown; dismissed ones are
  // hidden from the reviewer UI (they already said "false positive"
  // once — don't re-surface).
  const { data: flags } = await supabase
    .from("compliance_flags")
    .select(
      "id, layer, rule_id, severity, message, citation_refs, status, created_at, reviewed_by, reviewed_at, reviewed_note"
    )
    .eq("source_type", "call_summary")
    .eq("source_id", data.id)
    .in("status", ["pending", "approved"])
    .order("created_at", { ascending: true });

  return NextResponse.json({ audit: data, flags: flags || [] });
}

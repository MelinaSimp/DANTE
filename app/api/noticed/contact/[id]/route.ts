// GET /api/noticed/contact/[id]
//
// All the things D/V is currently flagging about a specific contact.
// Drives the DanteNoticed card that surfaces inline on detail pages
// and inside hover previews. Returns only signals that are ACTIVE —
// nothing flagged → empty arrays so the UI can hide its card cleanly.
//
// Workspace-scoped via the user's session.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const STALE_DAYS = 60;
const REVIEW_HORIZON_DAYS = 14;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const { id } = await params;
  const wid = profile.workspace_id;

  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select(
      "id, name, review_stage, next_review_date",
    )
    .eq("id", id)
    .eq("workspace_id", wid)
    .maybeSingle();
  if (!contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Most-recent activity across notes / emails / calls. We use this
  // to compute the stale signal — if all three are null, the contact
  // is "never touched" which we surface as stale-since-creation.
  const [
    { data: lastNote },
    { data: lastEmail },
    { data: lastCall },
    { data: drafts },
  ] = await Promise.all([
    supabaseAdmin
      .from("notes")
      .select("created_at")
      .eq("workspace_id", wid)
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("customer_emails")
      .select("received_at")
      .eq("workspace_id", wid)
      .eq("contact_id", id)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("call_recordings")
      .select("created_at")
      .eq("workspace_id", wid)
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("reminders")
      .select("id, subject, send_at, reason")
      .eq("workspace_id", wid)
      .eq("contact_id", id)
      .eq("status", "draft")
      .order("send_at", { ascending: true, nullsFirst: false })
      .limit(5),
  ]);

  // Stale signal: most recent activity older than STALE_DAYS, OR no
  // activity at all. We surface a `stale_days` number for the UI to
  // show "X days quiet"; null = not stale.
  const lastActivityIso =
    [lastNote?.created_at, lastEmail?.received_at, lastCall?.created_at]
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? null;
  let staleDays: number | null = null;
  if (lastActivityIso) {
    const days = Math.floor(
      (Date.now() - new Date(lastActivityIso).getTime()) / 86400_000,
    );
    if (days >= STALE_DAYS) staleDays = days;
  } else {
    // Never touched — count days since contact creation if we knew it,
    // else just flag as quiet without a number.
    staleDays = STALE_DAYS;
  }

  // Review due: stage is non-done and next_review_date within horizon
  // OR overdue.
  let reviewDue:
    | { stage: string; next_review_date: string; days_until: number }
    | null = null;
  if (
    contact.review_stage &&
    contact.review_stage !== "done" &&
    contact.next_review_date
  ) {
    const due = new Date(contact.next_review_date).getTime();
    const days = Math.floor((due - Date.now()) / 86400_000);
    if (days <= REVIEW_HORIZON_DAYS) {
      reviewDue = {
        stage: contact.review_stage,
        next_review_date: contact.next_review_date,
        days_until: days,
      };
    }
  }

  return NextResponse.json({
    id: contact.id,
    name: contact.name,
    stale_days: staleDays,
    pending_drafts: (drafts ?? []).map((d: any) => ({
      id: d.id,
      subject: d.subject,
      send_at: d.send_at,
      reason: d.reason,
    })),
    review_due: reviewDue,
  });
}

// PATCH /api/contacts/[id]/review
//
// Advance or set the review-cycle stage on a contact. Separate from
// the existing PUT /api/contacts/[id] (name/email/phone/notes) so
// review actions stay focused and the work-queue can call this with
// a tiny payload.
//
// Body shapes (any combination):
//   { stage: 'due'|'prep'|'meeting'|'recap_sent'|'done' }
//   { next_review_date: '2026-07-15' | null }
//   { review_cadence_months: 3 }
//
// On stage='done' we also stamp last_review_completed_at and roll
// next_review_date forward by review_cadence_months — the contact
// drops out of the work queue until the next cycle naturally
// surfaces it.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { remember } from "@/lib/dante/memory/write";

export const dynamic = "force-dynamic";

const VALID_STAGES = ["due", "prep", "meeting", "recap_sent", "done"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  const wid = profile.workspace_id;

  const { data: contact } = await supabase
    .from("contacts")
    .select(
      "id, name, review_stage, next_review_date, review_cadence_months, last_review_completed_at",
    )
    .eq("id", id)
    .eq("workspace_id", wid)
    .maybeSingle();
  if (!contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  let newStage: string | null | undefined = undefined;
  if (body.stage === null) {
    newStage = null;
    updates.review_stage = null;
  } else if (typeof body.stage === "string" && VALID_STAGES.includes(body.stage)) {
    newStage = body.stage;
    updates.review_stage = body.stage;
  }

  if (typeof body.next_review_date === "string" || body.next_review_date === null) {
    updates.next_review_date = body.next_review_date || null;
  }

  if (
    typeof body.review_cadence_months === "number" &&
    body.review_cadence_months >= 1 &&
    body.review_cadence_months <= 36
  ) {
    updates.review_cadence_months = body.review_cadence_months;
  }

  // Completion path — stamp completed_at and roll next_review_date
  // forward unless the caller is supplying one explicitly.
  if (newStage === "done") {
    updates.last_review_completed_at = new Date().toISOString();
    if (typeof body.next_review_date === "undefined") {
      const cadence =
        (typeof body.review_cadence_months === "number"
          ? body.review_cadence_months
          : null) ??
        contact.review_cadence_months ??
        3;
      const next = new Date();
      next.setMonth(next.getMonth() + cadence);
      updates.next_review_date = next.toISOString().slice(0, 10);
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("contacts")
    .update(updates)
    .eq("id", id)
    .eq("workspace_id", wid)
    .select(
      "id, name, review_stage, next_review_date, review_cadence_months, last_review_completed_at",
    )
    .single();

  if (error) {
    console.error("[contacts.review] update failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Memory write — stage transitions are useful retrieval signal.
  // "Where are we in the Smith review cycle?" should resolve from
  // memory rather than requiring the agent to dig.
  if (newStage) {
    try {
      await remember({
        workspaceId: wid,
        kind: "fact",
        content: `Review-cycle stage for ${data.name || "(unnamed)"} → ${newStage}${
          newStage === "done" && updates.next_review_date
            ? ` (next review ${updates.next_review_date})`
            : ""
        }`,
        subjectContactId: id,
        sourceKind: "workflow",
        sourceId: `review-stage:${id}:${Date.now()}`,
      });
    } catch (err) {
      console.error("[contacts.review] memory write failed:", err);
    }
  }

  return NextResponse.json(data);
}

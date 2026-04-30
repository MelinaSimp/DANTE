// GET /api/preview/contact/[id]
//
// Lightweight summary of a contact for the EntityHoverCard preview.
// Returns: name/email/phone, linked-property count, days since last
// interaction (most recent of note/email/call), review-cycle stage.
//
// Workspace-scoped via the user's session. RLS would also block
// cross-workspace reads but we 404 explicitly so the UI gets a
// clean signal instead of an empty payload.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  const { id } = await params;

  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select(
      "id, name, email, phone, review_stage, next_review_date, last_review_completed_at",
    )
    .eq("id", id)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fan-out for the supplementary aggregates. Each one is a small
  // count/most-recent query — cheap by themselves, parallelised.
  const [
    { count: propertyCount },
    { data: lastNote },
    { data: lastEmail },
    { data: lastCall },
  ] = await Promise.all([
    supabaseAdmin
      .from("property_clients")
      .select("property_id", { count: "exact", head: true })
      .eq("contact_id", id),
    supabaseAdmin
      .from("notes")
      .select("created_at")
      .eq("workspace_id", profile.workspace_id)
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("customer_emails")
      .select("received_at")
      .eq("workspace_id", profile.workspace_id)
      .eq("contact_id", id)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("call_recordings")
      .select("created_at")
      .eq("workspace_id", profile.workspace_id)
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Pick the most recent across all three. null if none.
  const candidates: Array<{ ts: string; kind: "note" | "email" | "call" }> = [];
  if (lastNote?.created_at)
    candidates.push({ ts: lastNote.created_at, kind: "note" });
  if (lastEmail?.received_at)
    candidates.push({ ts: lastEmail.received_at, kind: "email" });
  if (lastCall?.created_at)
    candidates.push({ ts: lastCall.created_at, kind: "call" });
  candidates.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  const latest = candidates[0] ?? null;

  return NextResponse.json({
    id: contact.id,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    linked_property_count: propertyCount ?? 0,
    last_interaction_at: latest?.ts ?? null,
    last_interaction_kind: latest?.kind ?? null,
    review_stage: contact.review_stage,
    next_review_date: contact.next_review_date,
  });
}

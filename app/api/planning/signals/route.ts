// GET /api/planning/signals
//
// Query params:
//   ?type=roth_conversion|rmd_due|tax_loss_harvest|beneficiary_mismatch
//   ?contactId=<uuid>
//   ?include_dismissed=1
//
// Returns active planning signals for the workspace, joined to the
// contact for display. Used by /planning, /planning/[type], and the
// per-client view.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const contactId = url.searchParams.get("contactId");
  const includeDismissed = url.searchParams.get("include_dismissed") === "1";

  let q = supabase
    .from("planning_signals")
    .select(
      "id, contact_id, signal_type, severity, title, summary, payload, citations, computed_at, dismissed_at, dismissed_reason"
    )
    .order("computed_at", { ascending: false });

  if (type) q = q.eq("signal_type", type);
  if (contactId) q = q.eq("contact_id", contactId);
  if (!includeDismissed) q = q.is("dismissed_at", null);

  const { data: signals, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Hydrate contact names in one query
  const contactIds = Array.from(
    new Set((signals || []).map((s: any) => s.contact_id))
  );
  let contactMap: Record<string, { name: string | null }> = {};
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, name")
      .in("id", contactIds);
    for (const c of contacts || []) {
      contactMap[(c as any).id] = { name: (c as any).name };
    }
  }

  const hydrated = (signals || []).map((s: any) => ({
    ...s,
    contact_name: contactMap[s.contact_id]?.name || null,
  }));

  // Counts by type for the bento header
  const counts: Record<string, number> = {
    roth_conversion: 0,
    rmd_due: 0,
    tax_loss_harvest: 0,
    beneficiary_mismatch: 0,
  };
  for (const s of hydrated) {
    if (s.dismissed_at) continue;
    counts[s.signal_type] = (counts[s.signal_type] || 0) + 1;
  }

  return NextResponse.json({ signals: hydrated, counts });
}

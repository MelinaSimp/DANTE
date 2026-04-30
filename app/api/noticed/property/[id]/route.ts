// GET /api/noticed/property/[id]
//
// All the things D/V is currently flagging about a specific
// property. Returns expiring documents, stuck-deal signals, and
// pending drafts about this property. Empty arrays / null for
// signals that aren't active — the UI hides its card when nothing
// is flagged.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const EXPIRY_HORIZON_DAYS = 60;

const STAGE_DWELL_DAYS: Record<string, number> = {
  listed: 30,
  showing: 30,
  offer: 7,
  pending: 21,
};

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

  const { data: prop } = await supabaseAdmin
    .from("properties")
    .select(
      "id, address_line1, city, transaction_stage, stage_entered_at, expected_close_date",
    )
    .eq("id", id)
    .eq("workspace_id", wid)
    .maybeSingle();
  if (!prop) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const todayIso = new Date().toISOString().slice(0, 10);
  const horizonIso = new Date(Date.now() + EXPIRY_HORIZON_DAYS * 86400_000)
    .toISOString()
    .slice(0, 10);

  const [{ data: expiringDocs }, { data: drafts }] = await Promise.all([
    supabaseAdmin
      .from("property_documents")
      .select("id, title, doc_kind, expires_at")
      .eq("workspace_id", wid)
      .eq("property_id", id)
      .gte("expires_at", todayIso)
      .lte("expires_at", horizonIso)
      .order("expires_at", { ascending: true })
      .limit(5),
    supabaseAdmin
      .from("reminders")
      .select("id, subject, send_at, reason")
      .eq("workspace_id", wid)
      .eq("property_id", id)
      .eq("status", "draft")
      .order("send_at", { ascending: true, nullsFirst: false })
      .limit(5),
  ]);

  // Stuck-deal signal: stage_entered_at older than the per-stage
  // dwell threshold. Null when the deal isn't stuck (or stage is
  // terminal / unset).
  let stuckDeal:
    | { stage: string; days_in_stage: number; threshold_days: number }
    | null = null;
  if (prop.transaction_stage && prop.stage_entered_at) {
    const dwell = STAGE_DWELL_DAYS[prop.transaction_stage];
    if (dwell) {
      const days = Math.floor(
        (Date.now() - new Date(prop.stage_entered_at).getTime()) / 86400_000,
      );
      if (days >= dwell) {
        stuckDeal = {
          stage: prop.transaction_stage,
          days_in_stage: days,
          threshold_days: dwell,
        };
      }
    }
  }

  return NextResponse.json({
    id: prop.id,
    address: [prop.address_line1, prop.city].filter(Boolean).join(", "),
    expiring_docs: (expiringDocs ?? []).map((d: any) => {
      const days = Math.floor(
        (new Date(d.expires_at).getTime() - Date.now()) / 86400_000,
      );
      return {
        id: d.id,
        title: d.title,
        doc_kind: d.doc_kind,
        expires_at: d.expires_at,
        days_until: days,
      };
    }),
    stuck_deal: stuckDeal,
    pending_drafts: (drafts ?? []).map((d: any) => ({
      id: d.id,
      subject: d.subject,
      send_at: d.send_at,
      reason: d.reason,
    })),
    expected_close_date: prop.expected_close_date,
  });
}

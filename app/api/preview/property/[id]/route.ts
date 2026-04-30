// GET /api/preview/property/[id]
//
// Lightweight summary of a property for the EntityHoverCard preview.
// Returns: address, transaction stage + days in stage, expected
// close date, linked client count, document count, and a count of
// docs expiring in the next 60 days.
//
// Workspace-scoped via the user's session.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const HORIZON_DAYS = 60;

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

  const { data: prop } = await supabaseAdmin
    .from("properties")
    .select(
      "id, address_line1, city, state, zip, status, kind, transaction_stage, stage_entered_at, expected_close_date, list_price_cents, beds, baths",
    )
    .eq("id", id)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!prop) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const horizonIso = new Date(Date.now() + HORIZON_DAYS * 86400_000)
    .toISOString()
    .slice(0, 10);

  const [{ count: clientCount }, { count: docCount }, { count: expiringCount }] =
    await Promise.all([
      supabaseAdmin
        .from("property_clients")
        .select("contact_id", { count: "exact", head: true })
        .eq("property_id", id),
      supabaseAdmin
        .from("property_documents")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", profile.workspace_id)
        .eq("property_id", id),
      supabaseAdmin
        .from("property_documents")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", profile.workspace_id)
        .eq("property_id", id)
        .gte("expires_at", todayIso)
        .lte("expires_at", horizonIso),
    ]);

  const stageDays = prop.stage_entered_at
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(prop.stage_entered_at).getTime()) / 86400_000,
        ),
      )
    : null;

  return NextResponse.json({
    id: prop.id,
    address: [prop.address_line1, prop.city, prop.state, prop.zip]
      .filter(Boolean)
      .join(", "),
    address_line1: prop.address_line1,
    status: prop.status,
    kind: prop.kind,
    transaction_stage: prop.transaction_stage,
    stage_days: stageDays,
    expected_close_date: prop.expected_close_date,
    list_price_cents: prop.list_price_cents,
    beds: prop.beds,
    baths: prop.baths,
    linked_client_count: clientCount ?? 0,
    document_count: docCount ?? 0,
    document_expiring_count: expiringCount ?? 0,
  });
}

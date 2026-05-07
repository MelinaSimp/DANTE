// /api/admin/customers — list view feeding /admin/customers.
//
// Returns one row per workspace with the per-customer billing fields,
// MTD AI spend, % of allowance, and YTD overage. Sorted by % of
// allowance descending (over-allowance customers float to the top —
// that's where ops attention is needed).
//
// Superadmin-only.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!hasSuperadminAccess(user.email, profile?.is_superadmin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: workspaces, error } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, industry, monthly_price_cents, usage_allowance_cents, overage_markup_pct, created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // MTD spend, batched per workspace. Single query: pull ledger rows
  // since the start of the current month, fold into a per-workspace
  // sum. Cheap because the (workspace_id, created_at desc) partial
  // index covers it.
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const { data: ledger } = await supabaseAdmin
    .from("dante_usage_ledger")
    .select("workspace_id, cost_cents")
    .gte("created_at", startOfMonth.toISOString());

  const mtdByWorkspace = new Map<string, number>();
  for (const r of (ledger || []) as { workspace_id: string; cost_cents: number }[]) {
    mtdByWorkspace.set(r.workspace_id, (mtdByWorkspace.get(r.workspace_id) || 0) + (r.cost_cents || 0));
  }

  // YTD overage — rows above-allowance, summed. Rough estimate; the
  // accurate version reconciles against billing exports. Sufficient
  // for the dashboard's at-a-glance health column.
  const startOfYear = new Date();
  startOfYear.setUTCMonth(0, 1);
  startOfYear.setUTCHours(0, 0, 0, 0);

  const { data: ytdLedger } = await supabaseAdmin
    .from("dante_usage_ledger")
    .select("workspace_id, cost_cents, created_at")
    .gte("created_at", startOfYear.toISOString());

  // Bucket by (workspace, year-month), then for each bucket compute
  // overage = max(0, sum - allowance). Allowance is the *current*
  // allowance for the workspace; if it changed mid-year this is
  // approximate, fine for an at-a-glance column.
  const allowanceById = new Map<string, number>(
    (workspaces || []).map((w) => [w.id, w.usage_allowance_cents ?? 3000]),
  );
  const monthlyByWs = new Map<string, Map<string, number>>();
  for (const r of (ytdLedger || []) as { workspace_id: string; cost_cents: number; created_at: string }[]) {
    const ym = r.created_at.slice(0, 7);
    const inner = monthlyByWs.get(r.workspace_id) || new Map<string, number>();
    inner.set(ym, (inner.get(ym) || 0) + (r.cost_cents || 0));
    monthlyByWs.set(r.workspace_id, inner);
  }
  const ytdOverageByWs = new Map<string, number>();
  for (const [wsId, monthMap] of monthlyByWs) {
    const allowance = allowanceById.get(wsId) ?? 3000;
    let total = 0;
    for (const monthSpend of monthMap.values()) {
      total += Math.max(0, monthSpend - allowance);
    }
    ytdOverageByWs.set(wsId, total);
  }

  const rows = (workspaces || []).map((w) => {
    const mtd = mtdByWorkspace.get(w.id) || 0;
    const allowance = w.usage_allowance_cents ?? 3000;
    const pct = allowance > 0 ? Math.floor((mtd / allowance) * 100) : 0;
    return {
      id: w.id,
      name: w.name,
      industry: w.industry,
      monthly_price_cents: w.monthly_price_cents ?? 14900,
      usage_allowance_cents: allowance,
      overage_markup_pct: w.overage_markup_pct ?? 30,
      mtd_cents: mtd,
      pct_of_allowance: pct,
      ytd_overage_cents: ytdOverageByWs.get(w.id) || 0,
      created_at: w.created_at,
    };
  });
  rows.sort((a, b) => b.pct_of_allowance - a.pct_of_allowance);

  return NextResponse.json({ rows });
}

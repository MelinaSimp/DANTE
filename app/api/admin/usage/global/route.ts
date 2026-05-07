// /api/admin/usage/global — Drift-wide aggregate.
// Total MRR, total AI cost MTD + last month, gross margin %, top
// customers by spend and by % of allowance. Superadmin only.

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

  const { data: workspaces } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, monthly_price_cents, usage_allowance_cents");

  const wsMap = new Map<string, { name: string; price: number; allowance: number }>();
  for (const w of (workspaces || []) as { id: string; name: string; monthly_price_cents: number | null; usage_allowance_cents: number | null }[]) {
    wsMap.set(w.id, {
      name: w.name,
      price: w.monthly_price_cents ?? 14900,
      allowance: w.usage_allowance_cents ?? 3000,
    });
  }

  const totalMrrCents = Array.from(wsMap.values()).reduce((s, w) => s + w.price, 0);

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const startOfLastMonth = new Date(startOfMonth);
  startOfLastMonth.setUTCMonth(startOfMonth.getUTCMonth() - 1);

  const [{ data: thisMonth }, { data: lastMonth }] = await Promise.all([
    supabaseAdmin
      .from("dante_usage_ledger")
      .select("workspace_id, cost_cents")
      .gte("created_at", startOfMonth.toISOString()),
    supabaseAdmin
      .from("dante_usage_ledger")
      .select("workspace_id, cost_cents")
      .gte("created_at", startOfLastMonth.toISOString())
      .lt("created_at", startOfMonth.toISOString()),
  ]);

  const mtdByWs = new Map<string, number>();
  for (const r of (thisMonth || []) as { workspace_id: string; cost_cents: number }[]) {
    mtdByWs.set(r.workspace_id, (mtdByWs.get(r.workspace_id) || 0) + (r.cost_cents || 0));
  }
  const lastMonthByWs = new Map<string, number>();
  for (const r of (lastMonth || []) as { workspace_id: string; cost_cents: number }[]) {
    lastMonthByWs.set(r.workspace_id, (lastMonthByWs.get(r.workspace_id) || 0) + (r.cost_cents || 0));
  }

  const totalAiMtdCents = Array.from(mtdByWs.values()).reduce((s, v) => s + v, 0);
  const totalAiLastMonthCents = Array.from(lastMonthByWs.values()).reduce((s, v) => s + v, 0);

  // Gross margin: (MRR - AI cost) / MRR. Doesn't include fixed
  // platform costs (Vercel/Supabase/Sentry/EasyAudit) — admin
  // dashboard knows those are separate.
  const grossMarginPct = totalMrrCents > 0
    ? Math.round(((totalMrrCents - totalAiMtdCents) / totalMrrCents) * 100)
    : null;

  // Top 10 customers by absolute MTD spend.
  const topBySpend = Array.from(mtdByWs.entries())
    .map(([id, mtd]) => ({ id, name: wsMap.get(id)?.name || id, mtd_cents: mtd }))
    .sort((a, b) => b.mtd_cents - a.mtd_cents)
    .slice(0, 10);

  // Top 10 customers by % of allowance.
  const topByPct = Array.from(mtdByWs.entries())
    .map(([id, mtd]) => {
      const ws = wsMap.get(id);
      const allowance = ws?.allowance ?? 3000;
      const pct = allowance > 0 ? Math.floor((mtd / allowance) * 100) : 0;
      return { id, name: ws?.name || id, mtd_cents: mtd, pct };
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 10);

  return NextResponse.json({
    customers_total: wsMap.size,
    total_mrr_cents: totalMrrCents,
    total_ai_mtd_cents: totalAiMtdCents,
    total_ai_last_month_cents: totalAiLastMonthCents,
    gross_margin_pct: grossMarginPct,
    mom_delta_pct: totalAiLastMonthCents > 0
      ? Math.round(((totalAiMtdCents - totalAiLastMonthCents) / totalAiLastMonthCents) * 100)
      : null,
    top_by_spend: topBySpend,
    top_by_pct: topByPct,
  });
}

// GET /api/me/usage
//
// Workspace-scoped cost view. Returns current-month usage broken
// down by source (which feature wrote the event), kind (LLM in/out
// tokens, voice minutes, email, SMS), and model. Used by
// /settings/usage so the workspace owner can see their own COGS.
//
// Different from /api/admin/usage (superadmin, all workspaces);
// this one is gated by the user's session and only ever shows the
// caller's own workspace.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { computeMonthlyBillUsd, getEnabledFeatures } from "@/lib/features";

export const dynamic = "force-dynamic";

type UsageRow = {
  kind: string;
  source: string | null;
  model: string | null;
  quantity: number;
  cost_cents: number;
  created_at: string;
};

function startOfMonthISO(d: Date = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

function startOfPriorMonthISO(d: Date = new Date()): string {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1),
  ).toISOString();
}

export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  const workspaceId = profile.workspace_id as string;

  const [{ data: ws }, { data: thisMonthRaw }, { data: priorMonthRaw }, { data: workflowCosts }] =
    await Promise.all([
      supabaseAdmin
        .from("workspaces")
        .select("id, name, enabled_features, billing_amount, billing_cycle")
        .eq("id", workspaceId)
        .maybeSingle(),
      supabaseAdmin
        .from("usage_events")
        .select("kind, source, model, quantity, cost_cents, created_at")
        .eq("workspace_id", workspaceId)
        .gte("created_at", startOfMonthISO())
        .order("created_at", { ascending: false })
        .limit(20_000),
      supabaseAdmin
        .from("usage_events")
        .select("cost_cents, kind")
        .eq("workspace_id", workspaceId)
        .gte("created_at", startOfPriorMonthISO())
        .lt("created_at", startOfMonthISO())
        .limit(20_000),
      // Per-workflow cost breakdown from the LLM ledger
      supabaseAdmin
        .from("dante_usage_ledger")
        .select("workflow_id, cost_cents, feature")
        .eq("workspace_id", workspaceId)
        .gte("created_at", startOfMonthISO())
        .not("workflow_id", "is", null)
        .limit(10_000),
    ]);

  const thisMonth = (thisMonthRaw || []) as UsageRow[];
  const priorMonth = (priorMonthRaw || []) as Array<{
    cost_cents: number;
    kind: string;
  }>;

  // ── Totals by kind ───────────────────────────────────────────
  const byKind: Record<string, { quantity: number; cost_cents: number }> = {};
  for (const r of thisMonth) {
    if (!byKind[r.kind]) byKind[r.kind] = { quantity: 0, cost_cents: 0 };
    byKind[r.kind].quantity += r.quantity;
    byKind[r.kind].cost_cents += r.cost_cents;
  }

  // ── Totals by source (feature/code path) ─────────────────────
  const bySource: Record<
    string,
    { cost_cents: number; events: number; quantity: number }
  > = {};
  for (const r of thisMonth) {
    const key = r.source || "(unattributed)";
    if (!bySource[key]) bySource[key] = { cost_cents: 0, events: 0, quantity: 0 };
    bySource[key].cost_cents += r.cost_cents;
    bySource[key].events += 1;
    bySource[key].quantity += r.quantity;
  }

  // ── LLM by model ────────────────────────────────────────────
  const byModel: Record<
    string,
    { input_tokens: number; output_tokens: number; cost_cents: number }
  > = {};
  for (const r of thisMonth) {
    if (r.kind !== "llm_tokens_input" && r.kind !== "llm_tokens_output") continue;
    const m = r.model || "(no model)";
    if (!byModel[m]) byModel[m] = { input_tokens: 0, output_tokens: 0, cost_cents: 0 };
    byModel[m].cost_cents += r.cost_cents;
    if (r.kind === "llm_tokens_input") byModel[m].input_tokens += r.quantity;
    else byModel[m].output_tokens += r.quantity;
  }

  // ── Per-workflow cost breakdown ───────────────────────────────
  const byWorkflow: Record<
    string,
    { cost_cents: number; calls: number }
  > = {};
  for (const r of (workflowCosts || []) as Array<{ workflow_id: string; cost_cents: number; feature: string | null }>) {
    const wfId = r.workflow_id;
    if (!byWorkflow[wfId]) byWorkflow[wfId] = { cost_cents: 0, calls: 0 };
    byWorkflow[wfId].cost_cents += r.cost_cents;
    byWorkflow[wfId].calls += 1;
  }

  // Resolve workflow names for the top spenders
  const topWorkflowIds = Object.entries(byWorkflow)
    .sort((a, b) => b[1].cost_cents - a[1].cost_cents)
    .slice(0, 20)
    .map(([id]) => id);
  const workflowNames: Record<string, string> = {};
  if (topWorkflowIds.length > 0) {
    const { data: wfRows } = await supabaseAdmin
      .from("dante_workflows")
      .select("id, name")
      .in("id", topWorkflowIds);
    for (const row of (wfRows || []) as Array<{ id: string; name: string }>) {
      workflowNames[row.id] = row.name;
    }
  }

  const byWorkflowNamed = Object.entries(byWorkflow)
    .sort((a, b) => b[1].cost_cents - a[1].cost_cents)
    .slice(0, 20)
    .map(([id, data]) => ({
      workflow_id: id,
      name: workflowNames[id] || `Workflow ${id.slice(0, 8)}`,
      cost_cents: data.cost_cents,
      calls: data.calls,
    }));

  // ── Daily timeseries (last 30 days, $0 for empty days) ──────
  const days: Record<string, number> = {};
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const k = d.toISOString().slice(0, 10);
    days[k] = 0;
  }
  for (const r of thisMonth) {
    const k = r.created_at.slice(0, 10);
    if (k in days) days[k] += r.cost_cents;
  }

  // ── Totals ─────────────────────────────────────────────────
  const totalCostCents = thisMonth.reduce((s, r) => s + r.cost_cents, 0);
  const priorTotalCents = priorMonth.reduce(
    (s, r) => s + (r.cost_cents || 0),
    0,
  );

  const enabled = getEnabledFeatures(
    (ws as any)?.enabled_features as string[] | null,
  );
  const monthlyPriceUsd = (ws as any)?.billing_amount
    ? Number((ws as any).billing_amount) / 100
    : computeMonthlyBillUsd(enabled);
  const monthlyCostUsd = totalCostCents / 100;
  const grossMarginUsd = monthlyPriceUsd - monthlyCostUsd;
  const grossMarginPct =
    monthlyPriceUsd > 0
      ? Math.round(((monthlyPriceUsd - monthlyCostUsd) / monthlyPriceUsd) * 100)
      : null;

  return NextResponse.json({
    workspace: {
      id: workspaceId,
      name: (ws as any)?.name || "Workspace",
    },
    period: {
      start: startOfMonthISO(),
      end: new Date().toISOString(),
    },
    summary: {
      total_cost_cents: totalCostCents,
      total_cost_usd: monthlyCostUsd,
      monthly_price_usd: monthlyPriceUsd,
      gross_margin_usd: grossMarginUsd,
      gross_margin_pct: grossMarginPct,
      prior_month_cost_cents: priorTotalCents,
      event_count: thisMonth.length,
    },
    by_kind: byKind,
    by_source: bySource,
    by_model: byModel,
    by_workflow: byWorkflowNamed,
    daily: days,
  });
}

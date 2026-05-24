// /api/admin/customers/[id] — read + update for the per-customer
// pricing detail page. GET returns the workspace's billing fields,
// model overrides, and last-12-months usage history for the chart.
// PATCH updates pricing/allowance/markup/model_overrides; superadmin only.

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";

export const dynamic = "force-dynamic";

async function requireSuperadmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!hasSuperadminAccess(user.email, profile?.is_superadmin)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperadmin();
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;

  const { data: ws, error } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, industry, monthly_price_cents, usage_allowance_cents, overage_markup_pct, billing_notes, model_overrides, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !ws) {
    return NextResponse.json({ error: error?.message || "Not found" }, { status: 404 });
  }

  // Last 12 calendar months of usage. Bucketed server-side so the
  // client just renders a bar.
  const start = new Date();
  start.setUTCMonth(start.getUTCMonth() - 11, 1);
  start.setUTCHours(0, 0, 0, 0);

  const { data: ledger } = await supabaseAdmin
    .from("dante_usage_ledger")
    .select("created_at, cost_cents")
    .eq("workspace_id", id)
    .gte("created_at", start.toISOString());

  const byMonth = new Map<string, number>();
  for (const r of (ledger || []) as { created_at: string; cost_cents: number }[]) {
    const ym = r.created_at.slice(0, 7);
    byMonth.set(ym, (byMonth.get(ym) || 0) + (r.cost_cents || 0));
  }
  // Fill in zero months so the chart has 12 bars.
  const history: { year_month: string; cost_cents: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(start);
    d.setUTCMonth(start.getUTCMonth() + i);
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    history.push({ year_month: ym, cost_cents: byMonth.get(ym) || 0 });
  }

  return NextResponse.json({ workspace: ws, history });
}

interface PatchBody {
  monthly_price_cents?: number;
  usage_allowance_cents?: number;
  overage_markup_pct?: number;
  billing_notes?: string | null;
  model_overrides?: Record<string, string>;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperadmin();
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.monthly_price_cents === "number" && body.monthly_price_cents >= 0) {
    update.monthly_price_cents = Math.floor(body.monthly_price_cents);
  }
  if (typeof body.usage_allowance_cents === "number" && body.usage_allowance_cents >= 0) {
    update.usage_allowance_cents = Math.floor(body.usage_allowance_cents);
  }
  if (typeof body.overage_markup_pct === "number" && body.overage_markup_pct >= 0 && body.overage_markup_pct <= 500) {
    update.overage_markup_pct = Math.floor(body.overage_markup_pct);
  }
  if (body.billing_notes !== undefined) {
    update.billing_notes = typeof body.billing_notes === "string" ? body.billing_notes.slice(0, 2000) : null;
  }
  if (body.model_overrides && typeof body.model_overrides === "object") {
    // Whitelist allowed keys to keep the jsonb shape predictable.
    const sanitized: Record<string, string> = {};
    for (const k of ["routing", "bulk", "hard"] as const) {
      const v = body.model_overrides[k];
      if (typeof v === "string" && v.length > 0 && v.length < 64) sanitized[k] = v;
    }
    update.model_overrides = sanitized;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("workspaces")
    .update(update)
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

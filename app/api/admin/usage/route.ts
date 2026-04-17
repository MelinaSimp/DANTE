import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";
import { DEFAULT_QUOTA, computeOverage, type QuotaRow, type UsageSummary } from "@/lib/usage/quota";

export const dynamic = "force-dynamic";

async function verifySuperadmin(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", auth.user.id)
    .maybeSingle();
  return hasSuperadminAccess(auth.user.email, profile?.is_superadmin);
}

// GET /api/admin/usage — per-workspace current-month usage + quota + overage
export async function GET(_req: NextRequest) {
  if (!(await verifySuperadmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [usageRes, quotasRes] = await Promise.all([
    supabaseAdmin
      .from("workspace_usage_current_month")
      .select("*")
      .order("total_cost_cents", { ascending: false }),
    supabaseAdmin.from("workspace_quotas").select("*"),
  ]);

  if (usageRes.error) {
    return NextResponse.json({ error: usageRes.error.message }, { status: 500 });
  }

  const quotaMap = new Map<string, QuotaRow>();
  for (const row of (quotasRes.data ?? []) as QuotaRow[]) {
    quotaMap.set(row.workspace_id, row);
  }

  const rows = ((usageRes.data ?? []) as UsageSummary[]).map((u) => {
    const quota = quotaMap.get(u.workspace_id) ?? {
      workspace_id: u.workspace_id,
      ...DEFAULT_QUOTA,
    };
    const overage = computeOverage(quota, u);
    return { usage: u, quota, overage };
  });

  return NextResponse.json({
    period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
    period_end: new Date().toISOString(),
    rows,
  });
}

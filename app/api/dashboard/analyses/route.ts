// app/api/dashboard/analyses/route.ts
//
// Powers the dashboard's "Recent analyses" feed and "Portfolio
// signals" alerts — both computed from real data:
//   - recent: the autonomous pipeline's latest document analyses
//   - signals: lease-expiry clustering (from lease_abstracts) and
//     elevated vacancy (from auto-underwritten rent rolls)
//
// This is what makes the dashboard's "live feed of analyses" and
// "autonomous alerts" claims real rather than scaffolding.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Severity = "act" | "watch" | "info";

interface Signal {
  id: string;
  kind: "lease_cluster" | "lease_expiry" | "vacancy";
  severity: Severity;
  title: string;
  detail: string;
  href: string;
}

const SEV_RANK: Record<Severity, number> = { act: 0, watch: 1, info: 2 };

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const ws = profile.workspace_id;

  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const horizon = new Date(today.getTime() + 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [recentRes, leaseRes, rollRes] = await Promise.all([
    supabaseAdmin
      .from("dante_document_analyses")
      .select("id, vault_item_id, doc_type, status, title, headline, summary, created_at")
      .eq("workspace_id", ws)
      .order("created_at", { ascending: false })
      .limit(6),
    supabaseAdmin
      .from("lease_abstracts")
      .select("id, tenant_name, expiration_date, vault_item_id")
      .eq("workspace_id", ws)
      .not("expiration_date", "is", null)
      .gte("expiration_date", todayISO)
      .lte("expiration_date", horizon)
      .order("expiration_date", { ascending: true })
      .limit(25),
    supabaseAdmin
      .from("dante_document_analyses")
      .select("id, title, summary, vault_item_id, created_at")
      .eq("workspace_id", ws)
      .eq("doc_type", "rent_roll")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const signals: Signal[] = [];

  // ── Lease expirations ──────────────────────────────────────────
  const leases = leaseRes.data || [];
  const within90 = leases.filter((l) => {
    const days = Math.floor(
      (new Date(l.expiration_date as string).getTime() - today.getTime()) / 86_400_000,
    );
    return days <= 90;
  });
  if (within90.length >= 3) {
    signals.push({
      id: "lease-cluster",
      kind: "lease_cluster",
      severity: "act",
      title: `${within90.length} leases expiring within 90 days`,
      detail: "Cluster of renewals — start outreach now",
      href: "/lease-abstractor",
    });
  }
  for (const l of leases.slice(0, 4)) {
    const exp = l.expiration_date as string;
    const days = Math.floor((new Date(exp).getTime() - today.getTime()) / 86_400_000);
    const severity: Severity = days <= 30 ? "act" : days <= 90 ? "watch" : "info";
    signals.push({
      id: `lease-${l.id}`,
      kind: "lease_expiry",
      severity,
      title: `${l.tenant_name || "Lease"} expires ${fmtDate(exp)}`,
      detail: `${days} day${days === 1 ? "" : "s"} out`,
      href: l.vault_item_id ? `/vault/${l.vault_item_id}` : "/lease-abstractor",
    });
  }

  // ── Elevated vacancy (from auto-underwritten rent rolls) ────────
  const rolls = rollRes.data || [];
  let vacancyCount = 0;
  for (const r of rolls) {
    const summary = (r.summary || {}) as Record<string, unknown>;
    const occ = typeof summary.occupancy_pct === "number" ? summary.occupancy_pct : null;
    if (occ == null || occ >= 0.9) continue;
    if (vacancyCount >= 3) break;
    vacancyCount++;
    signals.push({
      id: `vac-${r.id}`,
      kind: "vacancy",
      severity: occ < 0.85 ? "act" : "watch",
      title: `Vacancy elevated at ${r.title || "an asset"}`,
      detail: `${(occ * 100).toFixed(1)}% occupied`,
      href: r.vault_item_id ? `/vault/${r.vault_item_id}` : "/autopilot",
    });
  }

  signals.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);

  return NextResponse.json({
    recent: recentRes.data || [],
    signals: signals.slice(0, 8),
  });
}

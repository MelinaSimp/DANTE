// app/api/billing/checkout/route.ts
//
// POST /api/billing/checkout
//   body: { tier: "starter" | "pro" | "enterprise", seats?: number }
//   returns: { url } — redirect target for Stripe Checkout
//
// Phase 5 W5.5. Workspace admins kick off plan upgrades here. The
// webhook at /api/billing/webhook flips workspaces.plan_tier on
// the matching checkout.session.completed event.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createCheckoutSession } from "@/lib/billing/checkout";
import { canApprove, type Role } from "@/lib/auth/rbac";
import type { PlanTier } from "@/lib/billing/plan-tiers";

export const dynamic = "force-dynamic";

interface CheckoutBody {
  tier?: PlanTier;
  seats?: number;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return jsonError(400, "no_workspace");

  // Only admins (or supervisors) may upgrade — billing is a sensitive
  // workspace action. Superadmin bypasses for support flows.
  const role = ((profile as { role?: string }).role ?? "advisor") as Role;
  const isSuper = !!(profile as { is_superadmin?: boolean }).is_superadmin;
  if (!isSuper && !canApprove(role)) {
    return jsonError(403, "admin_or_supervisor_only");
  }

  const body = (await req.json().catch(() => ({}))) as CheckoutBody;
  if (!body.tier || !["starter", "pro", "enterprise"].includes(body.tier)) {
    return jsonError(400, "tier required (starter|pro|enterprise)");
  }

  // Pull workspace industry to choose the right Stripe price id.
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("industry")
    .eq("id", profile.workspace_id)
    .maybeSingle();
  const vertical =
    (ws as { industry?: string } | null)?.industry === "real_estate"
      ? "realtor"
      : "advisor";

  const result = await createCheckoutSession({
    workspaceId: profile.workspace_id,
    customerEmail: user.email ?? "",
    tier: body.tier,
    vertical,
    seats: body.seats,
  });
  if ("error" in result) {
    return jsonError(503, result.error);
  }
  return NextResponse.json({ url: result.url });
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

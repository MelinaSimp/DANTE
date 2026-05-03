// app/api/billing/checkout/route.ts
//
// POST /api/billing/checkout
//   body: { seats?: number }
//   returns: { url } — redirect target for Stripe Checkout
//
// Drift uses per-workspace pricing. The workspace's negotiated
// price_id lives on workspaces.stripe_price_id; this route picks
// it up and creates the checkout session. If no price is assigned,
// returns 503 no_price_assigned and the UI shows "Contact sales."

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createCheckoutSession } from "@/lib/billing/checkout";
import { canApprove, type Role } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

interface CheckoutBody {
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

  // Workspace admins / supervisors / superadmin only.
  const role = ((profile as { role?: string }).role ?? "advisor") as Role;
  const isSuper = !!(profile as { is_superadmin?: boolean }).is_superadmin;
  if (!isSuper && !canApprove(role)) {
    return jsonError(403, "admin_or_supervisor_only");
  }

  const body = (await req.json().catch(() => ({}))) as CheckoutBody;

  const result = await createCheckoutSession({
    workspaceId: profile.workspace_id,
    customerEmail: user.email ?? "",
    seats: body.seats,
  });
  if ("error" in result) {
    return jsonError(result.error === "no_price_assigned" ? 409 : 503, result.error);
  }
  return NextResponse.json({ url: result.url });
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// app/api/superadmin/workspaces/billing/route.ts
//
// Superadmin endpoint for assigning per-workspace pricing.
// Drift bills enterprise-style — each workspace has a negotiated
// price the sales / admin team sets here after closing the deal.
//
//   GET  /api/superadmin/workspaces/billing
//        list all workspaces + their billing config
//
//   POST /api/superadmin/workspaces/billing
//        body: {
//          workspace_id: string,
//          stripe_price_id: string | null,    -- Stripe Price ID; null clears
//          custom_price_cents: number | null, -- display amount
//          custom_plan_label: string | null,  -- e.g. "Acme Wealth — 12 seats"
//          plan_tier: "starter" | "pro" | "enterprise",
//          plan_seats: number
//        }
//
// Superadmin only. Audit-logged. The Stripe Price itself is
// created externally (Stripe Dashboard → Products) — this endpoint
// just records the workspace's assignment.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { invalidatePlanCache, type PlanTier } from "@/lib/billing/plan-tiers";

export const dynamic = "force-dynamic";

interface AssignBody {
  workspace_id?: string;
  stripe_price_id?: string | null;
  custom_price_cents?: number | null;
  custom_plan_label?: string | null;
  plan_tier?: PlanTier;
  plan_seats?: number;
}

export async function GET() {
  const ctx = await ensureSuperadmin();
  if (!ctx.ok) return ctx.response;

  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .select(
      "id, name, industry, plan_tier, plan_seats, plan_renewed_at, stripe_price_id, stripe_customer_id, stripe_subscription_id, custom_price_cents, custom_plan_label, created_at",
    )
    .order("created_at", { ascending: false });
  if (error) return jsonError(500, error.message);
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await ensureSuperadmin();
  if (!ctx.ok) return ctx.response;

  const body = (await req.json().catch(() => ({}))) as AssignBody;
  if (!body.workspace_id) return jsonError(400, "workspace_id required");

  // Validate fields. stripe_price_id can be null (clear), otherwise
  // basic shape check.
  if (body.stripe_price_id !== null && body.stripe_price_id !== undefined) {
    if (typeof body.stripe_price_id !== "string" || !body.stripe_price_id.startsWith("price_")) {
      return jsonError(400, "stripe_price_id must be a Stripe Price ID (price_...)");
    }
  }
  if (
    body.plan_tier !== undefined &&
    !["starter", "pro", "enterprise"].includes(body.plan_tier as string)
  ) {
    return jsonError(400, "plan_tier must be starter|pro|enterprise");
  }
  if (
    body.custom_price_cents !== undefined &&
    body.custom_price_cents !== null &&
    (typeof body.custom_price_cents !== "number" || body.custom_price_cents < 0)
  ) {
    return jsonError(400, "custom_price_cents must be a non-negative integer (cents)");
  }
  if (
    body.plan_seats !== undefined &&
    (typeof body.plan_seats !== "number" || body.plan_seats < 1)
  ) {
    return jsonError(400, "plan_seats must be ≥ 1");
  }

  const update: Record<string, unknown> = {};
  if (body.stripe_price_id !== undefined) update.stripe_price_id = body.stripe_price_id;
  if (body.custom_price_cents !== undefined) update.custom_price_cents = body.custom_price_cents;
  if (body.custom_plan_label !== undefined) update.custom_plan_label = body.custom_plan_label;
  if (body.plan_tier !== undefined) update.plan_tier = body.plan_tier;
  if (body.plan_seats !== undefined) update.plan_seats = body.plan_seats;

  if (Object.keys(update).length === 0) {
    return jsonError(400, "no_fields_to_update");
  }

  const { error } = await supabaseAdmin
    .from("workspaces")
    .update(update)
    .eq("id", body.workspace_id);
  if (error) return jsonError(500, error.message);

  invalidatePlanCache(body.workspace_id);

  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: body.workspace_id,
    user_id: ctx.userId,
    action: "billing.price_assigned",
    resource_type: "workspace",
    resource_id: body.workspace_id,
    metadata: update,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, applied: update });
}

interface SuperCtx {
  ok: true;
  userId: string;
}
interface SuperFail {
  ok: false;
  response: Response;
}

async function ensureSuperadmin(): Promise<SuperCtx | SuperFail> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: jsonError(401, "unauthorized") };
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!(profile as { is_superadmin?: boolean } | null)?.is_superadmin) {
    return { ok: false, response: jsonError(403, "superadmin_only") };
  }
  return { ok: true, userId: user.id };
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

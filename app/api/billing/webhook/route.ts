// app/api/billing/webhook/route.ts
//
// Stripe webhook receiver. Drift uses per-workspace pricing —
// plan_tier is set by superadmin, NOT inferred from price events.
// What this webhook does:
//
//   checkout.session.completed   → back-fill stripe_customer_id
//                                  + stripe_subscription_id; mark
//                                  plan_renewed_at + plan_seats
//   customer.subscription.updated → update plan_seats + renewed_at
//   customer.subscription.deleted → revert to starter, clear sub id
//
// Configured in Stripe → Developers → Webhooks with endpoint
// `https://<APP_URL>/api/billing/webhook`. Signing secret in
// STRIPE_WEBHOOK_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { invalidatePlanCache } from "@/lib/billing/plan-tiers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!secret || !stripeKey) {
    return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  const rawBody = Buffer.from(await req.arrayBuffer());

  type StripeShape = {
    webhooks: {
      constructEvent: (raw: Buffer, sig: string, secret: string) => {
        type: string;
        data: { object: Record<string, unknown> };
      };
    };
  };
  const StripeMod = (await import("stripe")).default as unknown as new (
    k: string,
    o?: unknown,
  ) => StripeShape;
  const stripe = new StripeMod(stripeKey, { apiVersion: "2024-06-20" });

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `signature_verification_failed: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 400 },
    );
  }

  // checkout.session.completed → first checkout. Back-fill the
  // customer + subscription ids so future renewals reuse them.
  // plan_tier is NOT inferred from the price (per-workspace
  // pricing decouples the dollar amount from the feature tier);
  // superadmin sets plan_tier separately when assigning the price.
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as {
      metadata?: { workspace_id?: string; seats?: string };
      customer?: string;
      subscription?: string;
    };
    const md = session.metadata ?? {};
    if (md.workspace_id) {
      const seats = parseInt(md.seats ?? "1", 10) || 1;
      const update: Record<string, unknown> = {
        plan_seats: seats,
        plan_renewed_at: new Date().toISOString(),
      };
      if (session.customer) update.stripe_customer_id = session.customer;
      if (session.subscription) update.stripe_subscription_id = session.subscription;
      await supabaseAdmin.from("workspaces").update(update).eq("id", md.workspace_id);
      invalidatePlanCache(md.workspace_id);
    }
  }

  // customer.subscription.updated → renewal or seat change.
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object as {
      metadata?: { workspace_id?: string };
      items?: { data?: Array<{ quantity?: number }> };
    };
    const wid = sub.metadata?.workspace_id;
    if (wid) {
      const seats = sub.items?.data?.[0]?.quantity ?? 1;
      await supabaseAdmin
        .from("workspaces")
        .update({
          plan_seats: seats,
          plan_renewed_at: new Date().toISOString(),
        })
        .eq("id", wid);
      invalidatePlanCache(wid);
    }
  }

  // subscription.deleted → revert to starter, clear subscription
  // id. Customer record stays so any future checkouts reuse it.
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as { metadata?: { workspace_id?: string } };
    const wid = sub.metadata?.workspace_id;
    if (wid) {
      await supabaseAdmin
        .from("workspaces")
        .update({ plan_tier: "starter", stripe_subscription_id: null })
        .eq("id", wid);
      invalidatePlanCache(wid);
    }
  }

  return NextResponse.json({ received: true });
}

// app/api/billing/webhook/route.ts
//
// Stripe webhook receiver. Listens for checkout.session.completed
// (initial subscription) and customer.subscription.updated /
// customer.subscription.deleted (renewals + downgrades). Flips
// workspaces.plan_tier accordingly and invalidates the in-memory
// plan cache.
//
// Phase 5 W5.5. Configured in Stripe → Developers → Webhooks with
// endpoint secret in STRIPE_WEBHOOK_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { invalidatePlanCache, type PlanTier } from "@/lib/billing/plan-tiers";

export const dynamic = "force-dynamic";
// Raw body required for signature verification; disable next's
// body parser by using arrayBuffer below.

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

  // checkout.session.completed → flip plan_tier from the metadata
  // we attached when creating the session.
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as {
      metadata?: { workspace_id?: string; tier?: string; seats?: string };
    };
    const md = session.metadata ?? {};
    if (md.workspace_id && md.tier && ["starter", "pro", "enterprise"].includes(md.tier)) {
      const seats = parseInt(md.seats ?? "1", 10) || 1;
      await supabaseAdmin
        .from("workspaces")
        .update({
          plan_tier: md.tier as PlanTier,
          plan_seats: seats,
          plan_renewed_at: new Date().toISOString(),
        })
        .eq("id", md.workspace_id);
      invalidatePlanCache(md.workspace_id);
    }
  }

  // subscription.deleted → revert to starter on cancellation.
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as { metadata?: { workspace_id?: string } };
    const wid = sub.metadata?.workspace_id;
    if (wid) {
      await supabaseAdmin.from("workspaces").update({ plan_tier: "starter" }).eq("id", wid);
      invalidatePlanCache(wid);
    }
  }

  return NextResponse.json({ received: true });
}

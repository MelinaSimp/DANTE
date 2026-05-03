// lib/billing/checkout.ts
//
// Phase 5 W5.5 — Stripe checkout wrapper.
//
// The plan-tier helper (lib/billing/plan-tiers.ts) gates features
// by reading workspaces.plan_tier. This file is the upgrade path
// users take to flip that column: a Stripe Checkout session per
// (tier, vertical), webhook updates plan_tier on success.
//
// Configuration (env):
//   STRIPE_SECRET_KEY                — server-side Stripe key
//   STRIPE_PRICE_STARTER_ADVISOR     — price id ($300/mo)
//   STRIPE_PRICE_PRO_ADVISOR         — price id ($800/mo)
//   STRIPE_PRICE_ENTERPRISE_ADVISOR  — price id ($1500/mo + per-seat)
//   STRIPE_PRICE_STARTER_REALTOR     — price id ($300/mo)
//   STRIPE_PRICE_PRO_REALTOR         — price id ($800/mo)
//   STRIPE_PRICE_ENTERPRISE_REALTOR  — price id ($1500/mo)
//   STRIPE_WEBHOOK_SECRET            — webhook signing secret
//   APP_URL                          — public base url for return urls
//
// Without these env vars, checkout falls back to a "pricing not
// yet configured" error so the rest of the app keeps working.

import type { PlanTier } from "./plan-tiers";

export type Vertical = "advisor" | "realtor";

interface PriceMap {
  starter: string | undefined;
  pro: string | undefined;
  enterprise: string | undefined;
}

function priceMap(vertical: Vertical): PriceMap {
  if (vertical === "advisor") {
    return {
      starter: process.env.STRIPE_PRICE_STARTER_ADVISOR,
      pro: process.env.STRIPE_PRICE_PRO_ADVISOR,
      enterprise: process.env.STRIPE_PRICE_ENTERPRISE_ADVISOR,
    };
  }
  return {
    starter: process.env.STRIPE_PRICE_STARTER_REALTOR,
    pro: process.env.STRIPE_PRICE_PRO_REALTOR,
    enterprise: process.env.STRIPE_PRICE_ENTERPRISE_REALTOR,
  };
}

export interface CheckoutInput {
  workspaceId: string;
  customerEmail: string;
  tier: PlanTier;
  vertical: Vertical;
  /** Number of seats for enterprise tier; ignored for starter/pro. */
  seats?: number;
}

export async function createCheckoutSession(
  input: CheckoutInput,
): Promise<{ url: string } | { error: string }> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return { error: "billing_not_configured" };
  const prices = priceMap(input.vertical);
  const priceId = prices[input.tier];
  if (!priceId) return { error: `price_not_configured:${input.tier}` };

  // Lazy import to keep stripe out of cold-start for non-billing paths.
  const StripeMod = (await import("stripe")).default as unknown as new (
    k: string,
    o?: unknown,
  ) => {
    checkout: {
      sessions: {
        create: (params: Record<string, unknown>) => Promise<{ url: string | null }>;
      };
    };
  };
  const stripe = new StripeMod(secret, { apiVersion: "2024-06-20" });
  const appUrl = process.env.APP_URL || "https://driftai.studio";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: input.customerEmail,
      line_items: [
        {
          price: priceId,
          quantity: input.tier === "enterprise" ? Math.max(1, input.seats ?? 1) : 1,
        },
      ],
      // The webhook reads these to flip workspaces.plan_tier on
      // checkout.session.completed.
      metadata: {
        workspace_id: input.workspaceId,
        tier: input.tier,
        vertical: input.vertical,
        seats: String(input.seats ?? 1),
      },
      success_url: `${appUrl}/settings/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/settings/billing?cancelled=1`,
    });
    if (!session.url) return { error: "checkout_url_missing" };
    return { url: session.url };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "checkout_failed",
    };
  }
}

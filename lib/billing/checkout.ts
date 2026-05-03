// lib/billing/checkout.ts
//
// Per-workspace pricing checkout wrapper.
//
// Drift bills enterprise-style: each workspace has a negotiated
// price assigned by superadmin (workspaces.stripe_price_id). This
// helper looks up the workspace's assigned price and creates a
// Stripe Checkout session against it. There are no global tier
// prices — every customer is custom.
//
// Configuration (env):
//   STRIPE_SECRET_KEY        — server-side Stripe key
//   STRIPE_WEBHOOK_SECRET    — webhook signing secret
//   APP_URL                  — public base url for return urls
//
// No more STRIPE_PRICE_* env vars — those were for the deprecated
// fixed-tier model.

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface CheckoutInput {
  workspaceId: string;
  customerEmail: string;
  /** Quantity for per-seat pricing. Ignored for flat-rate prices. */
  seats?: number;
}

export type CheckoutResult =
  | { url: string }
  | { error: string };

export async function createCheckoutSession(input: CheckoutInput): Promise<CheckoutResult> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return { error: "billing_not_configured" };

  // Pull the workspace's assigned price + customer record. Both
  // are negotiated/created externally by superadmin during the
  // sales process; we never auto-assign.
  const { data: ws, error: wsErr } = await supabaseAdmin
    .from("workspaces")
    .select("stripe_price_id, stripe_customer_id")
    .eq("id", input.workspaceId)
    .maybeSingle();
  if (wsErr) return { error: `workspace_lookup_failed: ${wsErr.message}` };
  if (!ws) return { error: "workspace_not_found" };

  const priceId = (ws as { stripe_price_id?: string }).stripe_price_id;
  if (!priceId) {
    // No price assigned → caller shows "Contact sales" UI instead
    // of a self-serve checkout button.
    return { error: "no_price_assigned" };
  }

  const customerId = (ws as { stripe_customer_id?: string }).stripe_customer_id;

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
      // If we already have a customer for this workspace, reuse —
      // renewals + seat changes hit the same record. Otherwise
      // Stripe creates one and the webhook back-fills.
      ...(customerId ? { customer: customerId } : { customer_email: input.customerEmail }),
      line_items: [
        {
          price: priceId,
          quantity: Math.max(1, input.seats ?? 1),
        },
      ],
      metadata: {
        workspace_id: input.workspaceId,
        seats: String(input.seats ?? 1),
      },
      subscription_data: {
        metadata: {
          workspace_id: input.workspaceId,
        },
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

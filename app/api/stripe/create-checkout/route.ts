// Stripe Checkout — custom-price-per-customer subscription flow.
//
// There's no public pricing page. Each workspace gets an individually
// negotiated price that a superadmin sets in /admin (workspaces table,
// "Set pricing" → writes workspaces.billing_amount in cents +
// billing_cycle). When that workspace's user clicks "Subscribe" in
// their settings, this route creates a Stripe Checkout session with
// an inline price_data object — no pre-created Stripe Price ID needed.
//
// Money flow: customer enters their card on Stripe's hosted page →
// Stripe charges their card → funds land in our Stripe balance →
// payouts to our bank. We never see the card number.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStripeAsync } from "@/lib/stripe";
import { getAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace" }, { status: 400 });
    }

    const stripe = await getStripeAsync();

    const { data: workspace } = await supabaseAdmin
      .from("workspaces")
      .select("stripe_customer_id, name, billing_amount, billing_cycle")
      .eq("id", profile.workspace_id)
      .single();

    // billing_amount is cents. 0 / null means admin hasn't set a price
    // for this customer yet — block checkout rather than default to $0.
    const amountCents = Number(workspace?.billing_amount ?? 0);
    if (!amountCents || amountCents <= 0) {
      return NextResponse.json(
        { error: "No price set for this workspace. Please contact support." },
        { status: 400 }
      );
    }
    const interval: "month" | "year" =
      workspace?.billing_cycle === "yearly" ? "year" : "month";

    let customerId = workspace?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: workspace?.name || undefined,
        metadata: { workspace_id: profile.workspace_id },
      });
      customerId = customer.id;

      await supabaseAdmin
        .from("workspaces")
        .update({ stripe_customer_id: customerId })
        .eq("id", profile.workspace_id);
    }

    const appUrl = getAppUrl();

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          // Inline price_data — Stripe accepts an ad-hoc price so we don't
          // need to pre-create one per customer. The Product is named
          // after the workspace so the invoice reads "Drift — NarenCo".
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            recurring: { interval },
            product_data: {
              name: `Drift — ${workspace?.name || "Subscription"}`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/settings?success=subscription_created`,
      cancel_url: `${appUrl}/settings?canceled=true`,
      metadata: { workspace_id: profile.workspace_id },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("[Stripe Checkout] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

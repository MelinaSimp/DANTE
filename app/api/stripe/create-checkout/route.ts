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

    const { priceId } = await req.json();
    if (!priceId) return NextResponse.json({ error: "priceId is required" }, { status: 400 });

    const stripe = await getStripeAsync();

    const { data: workspace } = await supabaseAdmin
      .from("workspaces")
      .select("stripe_customer_id, name")
      .eq("id", profile.workspace_id)
      .single();

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
      line_items: [{ price: priceId, quantity: 1 }],
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

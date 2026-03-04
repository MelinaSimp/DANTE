import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStripeAsync, getWebhookSecret } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const webhookSecretValue = await getWebhookSecret();
  if (!webhookSecretValue) {
    console.error("[Stripe Webhook] Webhook secret not configured");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event;
  try {
    const stripe = await getStripeAsync();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecretValue);
  } catch (err: any) {
    console.error("[Stripe Webhook] Signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;
        const workspaceId = session.metadata?.workspace_id;
        const subscriptionId = session.subscription;

        if (workspaceId && subscriptionId) {
          await supabaseAdmin
            .from("workspaces")
            .update({
              stripe_subscription_id: subscriptionId,
              plan_status: "active",
            })
            .eq("id", workspaceId);
          console.log(`[Stripe] Workspace ${workspaceId} subscribed: ${subscriptionId}`);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as any;
        const customerId = subscription.customer;

        const { data: workspace } = await supabaseAdmin
          .from("workspaces")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (workspace) {
          const status = subscription.status === "active" || subscription.status === "trialing"
            ? "active" : subscription.status === "past_due" ? "past_due" : "inactive";

          await supabaseAdmin
            .from("workspaces")
            .update({ plan_status: status })
            .eq("id", workspace.id);
          console.log(`[Stripe] Workspace ${workspace.id} subscription updated: ${status}`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as any;
        const customerId = subscription.customer;

        const { data: workspace } = await supabaseAdmin
          .from("workspaces")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (workspace) {
          await supabaseAdmin
            .from("workspaces")
            .update({
              plan_status: "canceled",
              stripe_subscription_id: null,
            })
            .eq("id", workspace.id);
          console.log(`[Stripe] Workspace ${workspace.id} subscription canceled`);
        }
        break;
      }

      default:
        break;
    }
  } catch (err: any) {
    console.error("[Stripe Webhook] Processing error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

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

  // Idempotency check. Signature verification proves the event came
  // from Stripe; it does NOT prove we haven't already processed it.
  // A captured signed payload is replayable forever until the secret
  // rotates. The ledger has event_id as PRIMARY KEY, so a duplicate
  // insert raises 23505 — that's our "already processed" signal.
  // Any other error is logged and the handler proceeds (fail-open is
  // safer here than fail-closed: missing a real event is worse than
  // double-processing in the rare connection-error case).
  {
    const { error: ledgerErr } = await supabaseAdmin
      .from("stripe_processed_events")
      .insert({ event_id: event.id, event_type: event.type });
    if (ledgerErr) {
      if ((ledgerErr as { code?: string }).code === "23505") {
        return NextResponse.json({ received: true, idempotent: true });
      }
      console.error("[Stripe Webhook] idempotency ledger insert failed:", ledgerErr.message);
    }
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

      case "invoice.payment_failed": {
        // Stripe usually also sends customer.subscription.updated with
        // status=past_due after retries, but not always (and the
        // timing is flaky). Trip past_due here so the billing gate
        // catches the failure on the next request.
        const invoice = event.data.object as any;
        const customerId = invoice.customer;
        if (customerId) {
          const { data: workspace } = await supabaseAdmin
            .from("workspaces")
            .select("id")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();
          if (workspace) {
            await supabaseAdmin
              .from("workspaces")
              .update({ plan_status: "past_due" })
              .eq("id", workspace.id);
            console.log(`[Stripe] Workspace ${workspace.id} payment failed → past_due`);
          }
        }
        break;
      }

      case "invoice.payment_succeeded": {
        // Recovery path: a previously past_due workspace caught up.
        // We don't flip inactive→active here (that's subscription
        // .updated's job) — only bump past_due back to active so the
        // gate unblocks immediately on retry.
        const invoice = event.data.object as any;
        const customerId = invoice.customer;
        if (customerId) {
          const { data: workspace } = await supabaseAdmin
            .from("workspaces")
            .select("id, plan_status")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();
          if (workspace && workspace.plan_status === "past_due") {
            await supabaseAdmin
              .from("workspaces")
              .update({ plan_status: "active" })
              .eq("id", workspace.id);
            console.log(`[Stripe] Workspace ${workspace.id} payment recovered → active`);
          }
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

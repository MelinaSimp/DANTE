/**
 * Stripe Webhooks Handler
 * Handles payment events from Stripe
 */

import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { supabaseAdmin } from "@/lib/supabase/admin";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature || !webhookSecret) {
      return NextResponse.json(
        { error: "Missing signature or webhook secret" },
        { status: 400 }
      );
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return NextResponse.json(
        { error: `Webhook Error: ${err.message}` },
        { status: 400 }
      );
    }

    // Log event
    await supabaseAdmin
      .from("billing_events")
      .insert({
        event_type: event.type,
        stripe_event_id: event.id,
        event_data: event.data.object as any,
        processed: false,
      });

    // Handle different event types
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handleInvoiceFailed(event.data.object as Stripe.Invoice);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Mark event as processed
    await supabaseAdmin
      .from("billing_events")
      .update({ processed: true })
      .eq("stripe_event_id", event.id);

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: error.message || "Webhook handler failed" },
      { status: 500 }
    );
  }
}

async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  // Update invoice status if linked
  if (paymentIntent.invoice) {
    await supabaseAdmin
      .from("invoices")
      .update({
        status: "paid",
        amount_paid: paymentIntent.amount / 100,
        paid_at: new Date().toISOString(),
      })
      .eq("stripe_payment_intent_id", paymentIntent.id);
  }
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  // Update invoice status
  if (paymentIntent.invoice) {
    await supabaseAdmin
      .from("invoices")
      .update({
        status: "uncollectible",
      })
      .eq("stripe_payment_intent_id", paymentIntent.id);
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  
  if (!customerId) return;

  // Find workspace
  const { data: stripeCustomer } = await supabaseAdmin
    .from("stripe_customers")
    .select("workspace_id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (!stripeCustomer) return;

  // Update or create invoice record
  await supabaseAdmin
    .from("invoices")
    .upsert({
      workspace_id: stripeCustomer.workspace_id,
      stripe_invoice_id: invoice.id,
      stripe_payment_intent_id: invoice.payment_intent as string || null,
      invoice_number: invoice.number || `INV-${Date.now()}`,
      status: "paid",
      amount_due: invoice.amount_due / 100,
      amount_paid: invoice.amount_paid / 100,
      subtotal: invoice.subtotal / 100,
      tax: invoice.tax || 0,
      total: invoice.total / 100,
      currency: invoice.currency,
      billing_period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
      billing_period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
      due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
      paid_at: new Date().toISOString(),
      invoice_pdf_url: invoice.invoice_pdf || null,
      line_items: invoice.lines.data.map(line => ({
        description: line.description,
        amount: line.amount / 100,
        quantity: line.quantity,
      })),
    }, {
      onConflict: "stripe_invoice_id",
    });
}

async function handleInvoiceFailed(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  
  if (!customerId) return;

  await supabaseAdmin
    .from("invoices")
    .update({
      status: "uncollectible",
    })
    .eq("stripe_invoice_id", invoice.id);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  
  if (!customerId) return;

  // Find workspace
  const { data: stripeCustomer } = await supabaseAdmin
    .from("stripe_customers")
    .select("workspace_id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (!stripeCustomer) return;

  // Update subscription
  await supabaseAdmin
    .from("subscriptions")
    .upsert({
      workspace_id: stripeCustomer.workspace_id,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
      status: subscription.status,
      billing_frequency: subscription.items.data[0]?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly',
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
      trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    }, {
      onConflict: "stripe_subscription_id",
    });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);
}

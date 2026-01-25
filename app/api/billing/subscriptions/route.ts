/**
 * Billing Subscriptions API
 * POST /api/billing/subscriptions - Create subscription for workspace
 * GET /api/billing/subscriptions?workspaceId=xxx - Get subscription for workspace
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

// Create subscription for a workspace
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_superadmin, role")
      .eq("id", user.id)
      .single();

    if (!profile?.is_superadmin && !['owner', 'admin'].includes(profile?.role || '')) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const {
      workspaceId,
      billingFrequency = 'monthly',
      email,
      paymentMethodId, // Optional: Stripe payment method ID
    } = await req.json();

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    // Get workspace
    const { data: workspace } = await supabaseAdmin
      .from("workspaces")
      .select("*")
      .eq("id", workspaceId)
      .single();

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Get or create Stripe customer
    let { data: stripeCustomer } = await supabaseAdmin
      .from("stripe_customers")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single();

    let customerId: string;

    if (stripeCustomer) {
      customerId = stripeCustomer.stripe_customer_id;
    } else {
      // Create Stripe customer
      const customer = await stripe.customers.create({
        email: email || workspace.owner_id ? (await supabaseAdmin.auth.getUserById(workspace.owner_id)).data?.user?.email : undefined,
        metadata: {
          workspace_id: workspaceId,
        },
      });

      // Save to database
      await supabaseAdmin
        .from("stripe_customers")
        .insert({
          workspace_id: workspaceId,
          stripe_customer_id: customer.id,
          email: customer.email || email,
        });

      customerId = customer.id;
    }

    // Get custom pricing
    const { data: pricing } = await supabaseAdmin
      .from("custom_pricing")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .single();

    const baseAmount = pricing?.base_subscription_amount || 1000.00;
    const setupFee = pricing?.setup_fee || 2000.00;

    // Calculate subscription amount based on frequency
    const subscriptionAmount = billingFrequency === 'yearly' 
      ? baseAmount * 12 
      : baseAmount;

    // Create Stripe subscription
    // We'll use a $0 subscription and add invoice items for usage-based billing
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Drift CRM Subscription - ${workspace.name}`,
            },
            recurring: {
              interval: billingFrequency === 'yearly' ? 'year' : 'month',
            },
            unit_amount: Math.round(subscriptionAmount * 100), // Convert to cents
          },
        },
      ],
      metadata: {
        workspace_id: workspaceId,
        billing_frequency: billingFrequency,
      },
      collection_method: 'charge_automatically',
      payment_behavior: 'default_incomplete',
    });

    // Add setup fee as one-time invoice item
    if (setupFee > 0) {
      await stripe.invoiceItems.create({
        customer: customerId,
        amount: Math.round(setupFee * 100),
        currency: 'usd',
        description: 'One-time setup fee',
        metadata: {
          workspace_id: workspaceId,
          type: 'setup_fee',
        },
      });
    }

    // Attach payment method if provided
    if (paymentMethodId) {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
    }

    // Save subscription to database
    const { data: subscriptionRecord, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        workspace_id: workspaceId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: customerId,
        status: subscription.status,
        billing_frequency: billingFrequency,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      })
      .select()
      .single();

    if (subError) {
      console.error("Error saving subscription:", subError);
      // Subscription created in Stripe but failed to save - this is recoverable
    }

    return NextResponse.json({
      subscription: subscriptionRecord,
      stripeSubscription: {
        id: subscription.id,
        status: subscription.status,
        client_secret: subscription.latest_invoice ? (subscription.latest_invoice as any).client_secret : null,
      },
    });
  } catch (error: any) {
    console.error("Error creating subscription:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create subscription" },
      { status: 500 }
    );
  }
}

// Get subscription for workspace
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    // Verify user has access to workspace
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .single();

    if (profile?.workspace_id !== workspaceId && !profile?.is_superadmin) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { data: subscription } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!subscription) {
      return NextResponse.json({ subscription: null });
    }

    // Get pricing info
    const { data: pricing } = await supabaseAdmin
      .from("custom_pricing")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .single();

    return NextResponse.json({
      subscription,
      pricing: pricing || null,
    });
  } catch (error: any) {
    console.error("Error fetching subscription:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch subscription" },
      { status: 500 }
    );
  }
}

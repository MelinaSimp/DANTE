/**
 * Invoices API
 * GET /api/billing/invoices?workspaceId=xxx - Get invoices for workspace
 * POST /api/billing/invoices/generate - Generate invoice for workspace (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

// Get invoices for workspace
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

    // Verify user has access
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id, is_superadmin, role")
      .eq("id", user.id)
      .single();

    if (profile?.workspace_id !== workspaceId && !profile?.is_superadmin && !['owner', 'admin'].includes(profile?.role || '')) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { data: invoices, error } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching invoices:", error);
      return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 });
    }

    return NextResponse.json({ invoices: invoices || [] });
  } catch (error: any) {
    console.error("Error fetching invoices:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch invoices" },
      { status: 500 }
    );
  }
}

// Generate invoice for workspace (admin only)
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
      startDate,
      endDate,
    } = await req.json();

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    // Get subscription
    const { data: subscription } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .single();

    if (!subscription) {
      return NextResponse.json({ error: "No active subscription found" }, { status: 404 });
    }

    // Get pricing
    const { data: pricing } = await supabaseAdmin
      .from("custom_pricing")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .single();

    // Calculate usage-based charges
    const periodStart = startDate || subscription.current_period_start;
    const periodEnd = endDate || subscription.current_period_end;

    // Get usage metrics
    const { data: usageMetrics } = await supabaseAdmin
      .from("usage_metrics")
      .select("*")
      .eq("workspace_id", workspaceId)
      .gte("metric_date", periodStart.split('T')[0])
      .lte("metric_date", periodEnd.split('T')[0]);

    // Calculate charges
    const baseAmount = pricing?.base_subscription_amount || 1000.00;
    const perCall = pricing?.per_call_amount || 0.001;
    const perAgent = pricing?.per_agent_amount || 0.00;
    const perMessage = pricing?.per_message_amount || 0.00;
    const perApiCall = pricing?.per_api_call_amount || 0.00;
    const storageGb = pricing?.storage_gb_amount || 0.00;

    const usage = (usageMetrics || []).reduce((acc: any, m: any) => {
      acc[m.metric_type] = (acc[m.metric_type] || 0) + parseFloat(m.metric_value.toString());
      return acc;
    }, {});

    const lineItems = [
      {
        description: "Base subscription",
        amount: baseAmount,
        quantity: 1,
      },
    ];

    if (usage.calls) {
      lineItems.push({
        description: `Calls (${usage.calls.toFixed(0)})`,
        amount: usage.calls * perCall,
        quantity: usage.calls,
      });
    }

    if (usage.agents) {
      lineItems.push({
        description: `Agents (${usage.agents.toFixed(0)})`,
        amount: usage.agents * perAgent,
        quantity: usage.agents,
      });
    }

    if (usage.messages) {
      lineItems.push({
        description: `Messages (${usage.messages.toFixed(0)})`,
        amount: usage.messages * perMessage,
        quantity: usage.messages,
      });
    }

    if (usage.api_calls) {
      lineItems.push({
        description: `API Calls (${usage.api_calls.toFixed(0)})`,
        amount: usage.api_calls * perApiCall,
        quantity: usage.api_calls,
      });
    }

    if (usage.storage_gb) {
      lineItems.push({
        description: `Storage (${usage.storage_gb.toFixed(2)} GB)`,
        amount: usage.storage_gb * storageGb,
        quantity: usage.storage_gb,
      });
    }

    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const total = subtotal; // Add tax if needed

    // Create invoice in Stripe
    const { data: stripeCustomer } = await supabaseAdmin
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("workspace_id", workspaceId)
      .single();

    if (!stripeCustomer) {
      return NextResponse.json({ error: "Stripe customer not found" }, { status: 404 });
    }

    // Create invoice items in Stripe
    for (const item of lineItems) {
      await stripe.invoiceItems.create({
        customer: stripeCustomer.stripe_customer_id,
        amount: Math.round(item.amount * 100),
        currency: 'usd',
        description: item.description,
      });
    }

    // Create and finalize invoice
    const invoice = await stripe.invoices.create({
      customer: stripeCustomer.stripe_customer_id,
      auto_advance: true, // Auto-finalize
      collection_method: 'charge_automatically',
    });

    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

    // Save to database
    const { data: invoiceRecord } = await supabaseAdmin
      .from("invoices")
      .insert({
        workspace_id: workspaceId,
        subscription_id: subscription.id,
        stripe_invoice_id: finalizedInvoice.id,
        invoice_number: finalizedInvoice.number || `INV-${Date.now()}`,
        status: finalizedInvoice.status === 'paid' ? 'paid' : 'open',
        amount_due: finalizedInvoice.amount_due / 100,
        amount_paid: finalizedInvoice.amount_paid / 100,
        subtotal: finalizedInvoice.subtotal / 100,
        tax: finalizedInvoice.tax || 0,
        total: finalizedInvoice.total / 100,
        currency: finalizedInvoice.currency,
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
        due_date: finalizedInvoice.due_date ? new Date(finalizedInvoice.due_date * 1000).toISOString() : null,
        invoice_pdf_url: finalizedInvoice.invoice_pdf || null,
        line_items: lineItems,
      })
      .select()
      .single();

    return NextResponse.json({
      invoice: invoiceRecord,
      stripeInvoice: {
        id: finalizedInvoice.id,
        status: finalizedInvoice.status,
        hosted_invoice_url: finalizedInvoice.hosted_invoice_url,
      },
    });
  } catch (error: any) {
    console.error("Error generating invoice:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate invoice" },
      { status: 500 }
    );
  }
}

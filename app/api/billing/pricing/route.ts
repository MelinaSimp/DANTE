/**
 * Custom Pricing API
 * POST /api/billing/pricing - Set custom pricing for workspace
 * GET /api/billing/pricing?workspaceId=xxx - Get pricing for workspace
 * PUT /api/billing/pricing/:id - Update pricing
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Set custom pricing for workspace
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
      baseSubscriptionAmount = 1000.00,
      perCallAmount = 0.001,
      perAgentAmount = 0.00,
      perMessageAmount = 0.00,
      perApiCallAmount = 0.00,
      storageGbAmount = 0.00,
      setupFee = 2000.00,
      billingFrequency = 'monthly',
      currency = 'USD',
    } = await req.json();

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    // Upsert pricing
    const { data: pricing, error } = await supabaseAdmin
      .from("custom_pricing")
      .upsert({
        workspace_id: workspaceId,
        base_subscription_amount: baseSubscriptionAmount,
        per_call_amount: perCallAmount,
        per_agent_amount: perAgentAmount,
        per_message_amount: perMessageAmount,
        per_api_call_amount: perApiCallAmount,
        storage_gb_amount: storageGbAmount,
        setup_fee: setupFee,
        billing_frequency: billingFrequency,
        currency: currency,
        is_active: true,
      }, {
        onConflict: "workspace_id",
      })
      .select()
      .single();

    if (error) {
      console.error("Error saving pricing:", error);
      return NextResponse.json({ error: "Failed to save pricing" }, { status: 500 });
    }

    return NextResponse.json({ pricing });
  } catch (error: any) {
    console.error("Error setting pricing:", error);
    return NextResponse.json(
      { error: error.message || "Failed to set pricing" },
      { status: 500 }
    );
  }
}

// Get pricing for workspace
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

    const { data: pricing } = await supabaseAdmin
      .from("custom_pricing")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .single();

    // Return default pricing if none exists
    if (!pricing) {
      return NextResponse.json({
        pricing: {
          base_subscription_amount: 1000.00,
          per_call_amount: 0.001,
          per_agent_amount: 0.00,
          per_message_amount: 0.00,
          per_api_call_amount: 0.00,
          storage_gb_amount: 0.00,
          setup_fee: 2000.00,
          billing_frequency: 'monthly',
          currency: 'USD',
        },
      });
    }

    return NextResponse.json({ pricing });
  } catch (error: any) {
    console.error("Error fetching pricing:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch pricing" },
      { status: 500 }
    );
  }
}

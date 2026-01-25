/**
 * Usage Tracking API
 * POST /api/billing/usage - Record usage metric
 * GET /api/billing/usage?workspaceId=xxx&startDate=xxx&endDate=xxx - Get usage metrics
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Record usage metric
export async function POST(req: NextRequest) {
  try {
    const {
      workspaceId,
      metricType,
      metricValue,
      metricDate,
      metadata = {},
    } = await req.json();

    if (!workspaceId || !metricType || metricValue === undefined) {
      return NextResponse.json(
        { error: "workspaceId, metricType, and metricValue are required" },
        { status: 400 }
      );
    }

    if (!['calls', 'messages', 'agents', 'api_calls', 'storage_gb'].includes(metricType)) {
      return NextResponse.json(
        { error: "Invalid metricType" },
        { status: 400 }
      );
    }

    const date = metricDate ? new Date(metricDate) : new Date();
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

    // Upsert usage metric (increment if exists, create if not)
    const { data: existing } = await supabaseAdmin
      .from("usage_metrics")
      .select("metric_value")
      .eq("workspace_id", workspaceId)
      .eq("metric_type", metricType)
      .eq("metric_date", dateStr)
      .single();

    let newValue: number;
    if (existing) {
      newValue = parseFloat(existing.metric_value.toString()) + parseFloat(metricValue.toString());
    } else {
      newValue = parseFloat(metricValue.toString());
    }

    const { data: metric, error } = await supabaseAdmin
      .from("usage_metrics")
      .upsert({
        workspace_id: workspaceId,
        metric_date: dateStr,
        metric_type: metricType,
        metric_value: newValue,
        metadata: metadata,
      }, {
        onConflict: "workspace_id,metric_date,metric_type",
      })
      .select()
      .single();

    if (error) {
      console.error("Error recording usage:", error);
      return NextResponse.json({ error: "Failed to record usage" }, { status: 500 });
    }

    return NextResponse.json({ metric });
  } catch (error: any) {
    console.error("Error recording usage:", error);
    return NextResponse.json(
      { error: error.message || "Failed to record usage" },
      { status: 500 }
    );
  }
}

// Get usage metrics
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
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

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

    let query = supabaseAdmin
      .from("usage_metrics")
      .select("*")
      .eq("workspace_id", workspaceId);

    if (startDate) {
      query = query.gte("metric_date", startDate);
    }
    if (endDate) {
      query = query.lte("metric_date", endDate);
    }

    const { data: metrics, error } = await query.order("metric_date", { ascending: false });

    if (error) {
      console.error("Error fetching usage:", error);
      return NextResponse.json({ error: "Failed to fetch usage" }, { status: 500 });
    }

    // Group by type and sum values
    const grouped = (metrics || []).reduce((acc: any, metric: any) => {
      if (!acc[metric.metric_type]) {
        acc[metric.metric_type] = 0;
      }
      acc[metric.metric_type] += parseFloat(metric.metric_value.toString());
      return acc;
    }, {});

    return NextResponse.json({
      metrics: metrics || [],
      totals: grouped,
    });
  } catch (error: any) {
    console.error("Error fetching usage:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch usage" },
      { status: 500 }
    );
  }
}

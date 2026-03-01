import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";
import { ALL_FEATURE_IDS, type FeatureId } from "@/lib/features";

export const dynamic = "force-dynamic";

async function verifySuperadmin(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", auth.user.id)
    .maybeSingle();
  return hasSuperadminAccess(auth.user.email, profile?.is_superadmin);
}

// GET — list all workspaces with their enabled features
export async function GET() {
  if (!(await verifySuperadmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, enabled_features, plan_status, created_at, stripe_customer_id, stripe_subscription_id")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

// PATCH — update features for a specific workspace
export async function PATCH(req: NextRequest) {
  if (!(await verifySuperadmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { workspace_id, enabled_features, plan_status } = body;

  if (!workspace_id) {
    return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (enabled_features !== undefined) {
    if (!Array.isArray(enabled_features)) {
      return NextResponse.json({ error: "enabled_features must be an array" }, { status: 400 });
    }
    const valid = enabled_features.every((f: string) => ALL_FEATURE_IDS.includes(f as FeatureId));
    if (!valid) {
      return NextResponse.json({ error: `Invalid feature IDs. Valid: ${ALL_FEATURE_IDS.join(", ")}` }, { status: 400 });
    }
    updates.enabled_features = enabled_features;
  }

  if (plan_status !== undefined) {
    if (!["active", "inactive", "trial", "past_due"].includes(plan_status)) {
      return NextResponse.json({ error: "Invalid plan_status" }, { status: 400 });
    }
    updates.plan_status = plan_status;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .update(updates)
    .eq("id", workspace_id)
    .select("id, name, enabled_features, plan_status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

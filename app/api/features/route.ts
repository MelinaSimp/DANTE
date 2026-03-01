import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ALL_FEATURE_IDS } from "@/lib/features";

export const dynamic = "force-dynamic";

// GET — returns the enabled features for the current user's workspace
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return NextResponse.json({ enabled_features: ALL_FEATURE_IDS, plan_status: "active" });
  }

  const { data: workspace } = await supabaseAdmin
    .from("workspaces")
    .select("enabled_features, plan_status")
    .eq("id", profile.workspace_id)
    .maybeSingle();

  return NextResponse.json({
    enabled_features: workspace?.enabled_features || ALL_FEATURE_IDS,
    plan_status: workspace?.plan_status || "active",
  });
}

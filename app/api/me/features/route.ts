import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ALL_FEATURE_IDS, getEnabledFeatures } from "@/lib/features";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return NextResponse.json({ features: ALL_FEATURE_IDS });
  }

  const { data: workspace } = await supabaseAdmin
    .from("workspaces")
    .select("enabled_features, plan_status")
    .eq("id", profile.workspace_id)
    .maybeSingle();

  const features = getEnabledFeatures(workspace?.enabled_features);
  const planStatus = workspace?.plan_status || "active";

  return NextResponse.json({ features, planStatus });
}

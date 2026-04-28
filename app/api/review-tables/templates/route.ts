// app/api/review-tables/templates/route.ts
//
// Returns the pre-built workflow templates available to the user's
// workspace, filtered by industry. Templates live in code (not the
// DB) — they're product-shaped defaults, not user data.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { templatesForIndustry } from "@/lib/review/templates";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json([]);

  const { data: workspace } = await supabaseAdmin
    .from("workspaces")
    .select("industry")
    .eq("id", profile.workspace_id)
    .maybeSingle();

  return NextResponse.json(templatesForIndustry(workspace?.industry));
}

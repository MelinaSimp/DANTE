// app/api/me/workspace/route.ts
//
// Returns the authenticated user's workspace plan info.
// Used by TrialBanner and billing UI to show trial status.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = await createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!prof?.workspace_id) {
    return NextResponse.json(
      { error: "No workspace" },
      { status: 404 },
    );
  }

  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select(
      "id, name, plan_tier, plan_status, plan_seats, trial_ends_at, invite_code",
    )
    .eq("id", prof.workspace_id)
    .maybeSingle();

  if (!ws) {
    return NextResponse.json(
      { error: "Workspace not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(ws);
}

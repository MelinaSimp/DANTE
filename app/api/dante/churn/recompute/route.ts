// app/api/dante/churn/recompute/route.ts
//
// POST → recompute churn scores for every contact in the caller's
// workspace, return the fresh ranked list. Idempotent: calling it
// twice just overwrites. No body required.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { recomputeChurnForWorkspace } from "@/lib/dante/churn";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  try {
    const scores = await recomputeChurnForWorkspace(profile.workspace_id);
    return NextResponse.json({
      ok: true,
      count: scores.length,
      computed_at: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Recompute failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// app/api/cron/trial-expire/route.ts
//
// Nightly cron: expire trial workspaces that have passed their
// trial_ends_at date. Also cleans up expired workflow step cache rows.
//
// The billing gate does lazy expiry on read, but this cron ensures
// consistent state even for dormant workspaces. Runs at 2 AM daily.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  // Verify cron secret to prevent unauthorized invocations
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, number> = {};

  // 1. Expire trial workspaces
  try {
    const { data: expired } = await supabaseAdmin
      .from("workspaces")
      .update({ plan_status: "inactive" })
      .eq("plan_status", "trialing")
      .lt("trial_ends_at", new Date().toISOString())
      .select("id");

    results.trials_expired = expired?.length ?? 0;
  } catch (err) {
    console.error("[trial-expire] workspace update failed:", err);
    results.trials_expired = -1;
  }

  // 2. Clean up expired workflow step cache
  try {
    const { data: cleaned } = await supabaseAdmin
      .from("dante_workflow_step_cache")
      .delete()
      .lt("expires_at", new Date().toISOString())
      .select("cache_key");

    results.cache_rows_cleaned = cleaned?.length ?? 0;
  } catch (err) {
    console.error("[trial-expire] cache cleanup failed:", err);
    results.cache_rows_cleaned = -1;
  }

  return NextResponse.json({
    ok: true,
    ...results,
    ran_at: new Date().toISOString(),
  });
}

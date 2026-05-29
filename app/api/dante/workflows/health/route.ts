// app/api/dante/workflows/health/route.ts
//
// Lightweight check: are any scheduled workflows currently broken?
// Returns the count of consecutive failures for each workflow that
// has failed its most recent run. The Dante landing page uses this
// to show a persistent health banner when automations need attention.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
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

  // Get workflows that are enabled + have a cron trigger (scheduled)
  const { data: workflows } = await supabaseAdmin
    .from("dante_workflows")
    .select("id, name, enabled")
    .eq("workspace_id", profile.workspace_id)
    .eq("enabled", true);

  if (!workflows || workflows.length === 0) {
    return NextResponse.json({ failing: [], ok: true });
  }

  // For each enabled workflow, check if the latest run errored
  const failing: Array<{
    workflow_id: string;
    workflow_name: string;
    error: string;
    last_run: string;
    consecutive_failures: number;
  }> = [];

  for (const wf of workflows) {
    const { data: runs } = await supabaseAdmin
      .from("dante_workflow_runs")
      .select("status, error, started_at")
      .eq("workflow_id", wf.id)
      .order("started_at", { ascending: false })
      .limit(10);

    if (!runs || runs.length === 0) continue;

    // Count consecutive failures from most recent
    if (runs[0].status !== "error") continue;

    let streak = 0;
    for (const r of runs) {
      if (r.status === "error") streak++;
      else break;
    }

    failing.push({
      workflow_id: wf.id,
      workflow_name: wf.name,
      error: runs[0].error || "Unknown error",
      last_run: runs[0].started_at,
      consecutive_failures: streak,
    });
  }

  return NextResponse.json({
    ok: failing.length === 0,
    failing,
  });
}

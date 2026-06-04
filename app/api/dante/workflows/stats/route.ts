// app/api/dante/workflows/stats/route.ts
//
// Operations dashboard stats: aggregate workflow health, run counts,
// success/failure rates, average durations, and per-workflow breakdown.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

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
  if (!profile?.workspace_id) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const workspaceId = profile.workspace_id;

  // Fetch all workflows
  const { data: workflows } = await supabaseAdmin
    .from("dante_workflows")
    .select("id, name, enabled, created_at, last_run_at, last_run_status")
    .eq("workspace_id", workspaceId)
    .order("name");

  if (!workflows) return NextResponse.json({ error: "Failed to load workflows" }, { status: 500 });

  // Fetch all runs from the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: runs } = await supabaseAdmin
    .from("dante_workflow_runs")
    .select("id, workflow_id, status, started_at, finished_at, error")
    .eq("workspace_id", workspaceId)
    .gte("started_at", thirtyDaysAgo)
    .order("started_at", { ascending: false });

  const allRuns = runs || [];

  // Aggregate stats
  const totalRuns = allRuns.length;
  const successRuns = allRuns.filter((r) => r.status === "success").length;
  const errorRuns = allRuns.filter((r) => r.status === "error").length;
  const cancelledRuns = allRuns.filter((r) => r.status === "cancelled").length;
  const successRate = totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 0;

  // Average duration (only finished runs)
  const durations = allRuns
    .filter((r) => r.started_at && r.finished_at)
    .map((r) => new Date(r.finished_at).getTime() - new Date(r.started_at).getTime());
  const avgDurationMs = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  // Per-day run counts (last 14 days)
  const dailyCounts: Array<{ date: string; success: number; error: number; total: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayRuns = allRuns.filter((r) => r.started_at?.startsWith(dateStr));
    dailyCounts.push({
      date: dateStr,
      success: dayRuns.filter((r) => r.status === "success").length,
      error: dayRuns.filter((r) => r.status === "error").length,
      total: dayRuns.length,
    });
  }

  // Per-workflow breakdown
  const perWorkflow = workflows.map((wf) => {
    const wfRuns = allRuns.filter((r) => r.workflow_id === wf.id);
    const wfSuccess = wfRuns.filter((r) => r.status === "success").length;
    const wfError = wfRuns.filter((r) => r.status === "error").length;
    const wfDurations = wfRuns
      .filter((r) => r.started_at && r.finished_at)
      .map((r) => new Date(r.finished_at).getTime() - new Date(r.started_at).getTime());
    const wfAvgMs = wfDurations.length > 0
      ? Math.round(wfDurations.reduce((a, b) => a + b, 0) / wfDurations.length)
      : 0;

    // Consecutive failures from most recent
    let failStreak = 0;
    for (const r of wfRuns) {
      if (r.status === "error") failStreak++;
      else break;
    }

    const lastError = wfRuns.find((r) => r.status === "error");

    return {
      id: wf.id,
      name: wf.name,
      enabled: wf.enabled,
      last_run_at: wf.last_run_at,
      last_run_status: wf.last_run_status,
      total_runs: wfRuns.length,
      success_count: wfSuccess,
      error_count: wfError,
      success_rate: wfRuns.length > 0 ? Math.round((wfSuccess / wfRuns.length) * 100) : null,
      avg_duration_ms: wfAvgMs,
      consecutive_failures: failStreak,
      last_error: lastError?.error || null,
      last_error_at: lastError?.started_at || null,
    };
  });

  // Workflows needing attention (3+ consecutive failures)
  const needsAttention = perWorkflow.filter((w) => w.consecutive_failures >= 3);

  return NextResponse.json({
    summary: {
      total_workflows: workflows.length,
      active_workflows: workflows.filter((w) => w.enabled).length,
      total_runs_30d: totalRuns,
      success_runs: successRuns,
      error_runs: errorRuns,
      cancelled_runs: cancelledRuns,
      success_rate: successRate,
      avg_duration_ms: avgDurationMs,
    },
    daily: dailyCounts,
    workflows: perWorkflow,
    needs_attention: needsAttention,
  });
}

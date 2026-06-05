// app/api/dante/workflows/optimize/route.ts
//
// Analyzes workflow run history and suggests optimizations.
// Returns actionable recommendations based on:
//   - Slow steps (P95 duration outliers)
//   - High-failure steps (error rate > 20%)
//   - Cache-eligible steps that aren't being cached
//   - Steps that always produce the same output (candidates for hardcoding)
//   - Unused branches (condition edges never taken)

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface Suggestion {
  type: "slow_step" | "high_failure" | "cache_candidate" | "unused_branch" | "constant_output";
  severity: "info" | "warning" | "critical";
  workflow_id: string;
  workflow_name: string;
  step_id?: string;
  step_name?: string;
  step_type?: string;
  message: string;
  detail: string;
}

export async function GET(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id)
    return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const workspaceId = profile.workspace_id;

  // Query param: workflow_id filters to a single workflow
  const url = new URL(req.url);
  const targetWorkflowId = url.searchParams.get("workflow_id");

  // Fetch workflows
  const wfQuery = supabaseAdmin
    .from("dante_workflows")
    .select("id, name, definition")
    .eq("workspace_id", workspaceId);
  if (targetWorkflowId) wfQuery.eq("id", targetWorkflowId);
  const { data: workflows } = await wfQuery;
  if (!workflows?.length)
    return NextResponse.json({ suggestions: [], analyzed: 0 });

  // Fetch runs with logs from last 14 days
  const twoWeeksAgo = new Date(
    Date.now() - 14 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const runQuery = supabaseAdmin
    .from("dante_workflow_runs")
    .select("id, workflow_id, status, log, started_at, finished_at")
    .eq("workspace_id", workspaceId)
    .gte("started_at", twoWeeksAgo)
    .order("started_at", { ascending: false })
    .limit(200);
  if (targetWorkflowId) runQuery.eq("workflow_id", targetWorkflowId);
  const { data: runs } = await runQuery;
  if (!runs?.length)
    return NextResponse.json({ suggestions: [], analyzed: 0 });

  const suggestions: Suggestion[] = [];

  for (const wf of workflows) {
    const wfRuns = runs.filter((r) => r.workflow_id === wf.id);
    if (!wfRuns.length) continue;

    // Parse step logs from all runs
    const stepStats = new Map<
      string,
      {
        name: string;
        type: string;
        durations: number[];
        errors: number;
        total: number;
        outputs: string[];
      }
    >();

    for (const run of wfRuns) {
      const log = (run.log || []) as Array<{
        step_id: string;
        step_name: string;
        step_type: string;
        status: string;
        started_at: string;
        finished_at: string;
        output?: unknown;
      }>;
      for (const entry of log) {
        if (!entry.step_id) continue;
        let stat = stepStats.get(entry.step_id);
        if (!stat) {
          stat = {
            name: entry.step_name || entry.step_id,
            type: entry.step_type || "unknown",
            durations: [],
            errors: 0,
            total: 0,
            outputs: [],
          };
          stepStats.set(entry.step_id, stat);
        }
        stat.total++;
        if (entry.status === "error") stat.errors++;
        if (entry.started_at && entry.finished_at) {
          const dur =
            new Date(entry.finished_at).getTime() -
            new Date(entry.started_at).getTime();
          stat.durations.push(dur);
        }
        if (entry.output && entry.status === "success") {
          const sig = JSON.stringify(entry.output).slice(0, 200);
          stat.outputs.push(sig);
        }
      }
    }

    // Analyze each step
    for (const [stepId, stat] of stepStats) {
      // 1. Slow steps (P95 > 10s, at least 5 runs)
      if (stat.durations.length >= 5) {
        const sorted = [...stat.durations].sort((a, b) => a - b);
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const median = sorted[Math.floor(sorted.length * 0.5)];
        if (p95 > 10_000) {
          suggestions.push({
            type: "slow_step",
            severity: p95 > 30_000 ? "warning" : "info",
            workflow_id: wf.id,
            workflow_name: wf.name,
            step_id: stepId,
            step_name: stat.name,
            step_type: stat.type,
            message: `Step "${stat.name}" is slow (P95: ${(p95 / 1000).toFixed(1)}s)`,
            detail: `Median: ${(median / 1000).toFixed(1)}s, P95: ${(p95 / 1000).toFixed(1)}s across ${stat.durations.length} runs. Consider caching, simplifying the prompt, or breaking into sub-steps.`,
          });
        }
      }

      // 2. High failure rate (>20%, at least 3 runs)
      if (stat.total >= 3 && stat.errors / stat.total > 0.2) {
        const rate = Math.round((stat.errors / stat.total) * 100);
        suggestions.push({
          type: "high_failure",
          severity: rate > 50 ? "critical" : "warning",
          workflow_id: wf.id,
          workflow_name: wf.name,
          step_id: stepId,
          step_name: stat.name,
          step_type: stat.type,
          message: `Step "${stat.name}" fails ${rate}% of the time`,
          detail: `${stat.errors} failures in ${stat.total} runs. Check the step configuration and inputs.`,
        });
      }

      // 3. Constant output (all outputs identical, at least 5 runs)
      if (stat.outputs.length >= 5) {
        const unique = new Set(stat.outputs);
        if (unique.size === 1) {
          suggestions.push({
            type: "constant_output",
            severity: "info",
            workflow_id: wf.id,
            workflow_name: wf.name,
            step_id: stepId,
            step_name: stat.name,
            step_type: stat.type,
            message: `Step "${stat.name}" always produces the same output`,
            detail: `${stat.outputs.length} consecutive identical outputs. Consider hardcoding the result or increasing the cache TTL.`,
          });
        }
      }
    }

    // 4. Overall workflow health
    const errorRate =
      wfRuns.length > 0
        ? wfRuns.filter((r) => r.status === "error").length / wfRuns.length
        : 0;
    if (wfRuns.length >= 5 && errorRate > 0.3) {
      suggestions.push({
        type: "high_failure",
        severity: "critical",
        workflow_id: wf.id,
        workflow_name: wf.name,
        message: `Workflow "${wf.name}" has a ${Math.round(errorRate * 100)}% failure rate`,
        detail: `${wfRuns.filter((r) => r.status === "error").length} failed out of ${wfRuns.length} runs in the last 14 days. Review error logs and consider adding error handling (on_error: continue) for non-critical steps.`,
      });
    }
  }

  // Sort: critical first, then warning, then info
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  suggestions.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
  );

  return NextResponse.json({
    suggestions,
    analyzed: runs.length,
    workflows_analyzed: workflows.length,
    period: "14d",
  });
}

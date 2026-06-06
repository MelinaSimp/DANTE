// app/api/dante/workflows/runs/[runId]/route.ts
//
// GET → fetch a single run with its full log + output. Used by the
// workflow editor to render the last-run panel. If the run has an
// n8n_execution_id, also fetches per-node execution traces from n8n
// (Phase 1 board requirement: per-node execution traces).

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { log as rootLog } from "@/lib/logging";

const runLog = rootLog.child({ component: "run-detail" });

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles")
    .select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  // Try both the run ID and n8n_execution_id (the agent returns n8n
  // execution IDs as run_id for n8n-backed workflows)
  const { data: run } = await supabaseAdmin
    .from("dante_workflow_runs")
    .select("*")
    .or(`id.eq.${runId},n8n_execution_id.eq.${runId}`)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();

  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // If this is an n8n-backed run, fetch per-node execution traces
  const n8nExecId = (run as any).n8n_execution_id as string | null;
  let nodeTraces: Array<{
    node: string;
    status: string;
    duration_ms?: number;
    items?: number;
    error?: string;
    output_preview?: unknown;
  }> | undefined;

  if (n8nExecId) {
    try {
      const { getExecution } = await import("@/lib/dante/n8n-bridge");
      const exec = await getExecution(n8nExecId, true);

      // Update run status if n8n has a newer status
      if (exec.status && exec.status !== run.status) {
        const mappedStatus = exec.status === "success" ? "completed"
          : exec.status === "error" ? "failed"
          : exec.status === "running" ? "running"
          : run.status;
        if (mappedStatus !== run.status) {
          await supabaseAdmin
            .from("dante_workflow_runs")
            .update({
              status: mappedStatus,
              finished_at: exec.stoppedAt || null,
            })
            .eq("id", run.id);
          (run as any).status = mappedStatus;
          (run as any).finished_at = exec.stoppedAt || run.finished_at;
        }
      }

      // Extract per-node traces
      const runData = exec.data?.resultData?.runData;
      if (runData && typeof runData === "object") {
        nodeTraces = [];
        for (const [nodeName, runs] of Object.entries(runData)) {
          if (!Array.isArray(runs)) continue;
          for (const r of runs) {
            const trace: typeof nodeTraces[0] = {
              node: nodeName,
              status: r.executionStatus || "unknown",
            };
            if (r.executionTime !== undefined) trace.duration_ms = r.executionTime;
            if (r.error) {
              trace.error = typeof r.error === "string"
                ? r.error
                : (r.error as any)?.message || String(r.error);
            }
            const mainOutput = r.data?.main?.[0];
            if (Array.isArray(mainOutput) && mainOutput.length > 0) {
              trace.items = mainOutput.length;
              const firstJson = mainOutput[0]?.json;
              if (firstJson) {
                const preview = JSON.stringify(firstJson);
                trace.output_preview = preview.length > 1000
                  ? { _truncated: true, preview: preview.slice(0, 1000) }
                  : firstJson;
              }
            }
            nodeTraces.push(trace);
          }
        }
      }
    } catch (err) {
      runLog.warn("failed to fetch n8n execution traces", {
        n8nExecId,
        err: err instanceof Error ? err.message : String(err),
      });
      // Non-fatal — return run without traces
    }
  }

  return NextResponse.json({
    run,
    engine: n8nExecId ? "n8n" : "legacy",
    ...(nodeTraces ? { node_traces: nodeTraces } : {}),
  });
}

// app/api/dante/workflows/[workflowId]/run/route.ts
//
// POST → kick off a run of this workflow.
//
// Two modes:
//   • mode: "sync" (default, back-compat) — executes inline and returns
//     the full log + output. Capped by the 60s route budget.
//   • mode: "queue" — inserts a queued row, fires a best-effort kick
//     to /api/dante/queue/tick so a worker starts immediately, and
//     returns { run_id, status: "queued" }. The caller polls the run
//     detail endpoint. Required for workflows that legitimately take
//     longer than 60s.
//
// The editor's Run button uses "queue" so it can poll and render
// intermediate state; external callers default to "sync" to keep
// the one-shot behavior they're wired for.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runWorkflow } from "@/lib/dante/workflow-runner";
import { definitionFromRow } from "@/lib/dante/workflow-types";
import { enqueueRun, kickQueueWorker, notifyRunFailure } from "@/lib/dante/run-executor";
import { requireActiveBilling } from "@/lib/billing/gate";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel hobby limit

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { workflowId } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles")
    .select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const { data: wf } = await supabaseAdmin
    .from("dante_workflows")
    .select("*")
    .eq("id", workflowId)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const gate = await requireActiveBilling(profile.workspace_id);
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => ({}));
  const input = (body.input && typeof body.input === "object") ? body.input : {};
  const mode = body.mode === "queue" ? "queue" : "sync";

  // ── Queue mode ────────────────────────────────────────────
  if (mode === "queue") {
    const result = await enqueueRun({
      workflow_id: workflowId,
      workspace_id: profile.workspace_id,
      triggered_by: user.id,
      payload: input,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    // Eager kick — don't block the response on this; it returns fast
    // and the worker drains in its own lambda invocation.
    const origin = new URL(request.url).origin;
    kickQueueWorker(origin);

    logAuditEvent({
      workspaceId: profile.workspace_id,
      actorUserId: user.id,
      actorKind: "user",
      action: "workflow.queued",
      entityType: "dante_workflow",
      entityId: workflowId,
      metadata: { run_id: result.run_id, workflow_name: wf.name },
      request,
    });

    return NextResponse.json({ run_id: result.run_id, status: "queued" });
  }

  // ── Sync mode (legacy path) ───────────────────────────────
  const { data: run } = await supabaseAdmin
    .from("dante_workflow_runs")
    .insert({
      workflow_id: workflowId,
      workspace_id: profile.workspace_id,
      triggered_by: user.id,
      status: "running",
      input,
    })
    .select()
    .single();

  const runId = run?.id;

  try {
    const definition = definitionFromRow(wf);
    const result = await runWorkflow(definition, input);

    await supabaseAdmin.from("dante_workflow_runs").update({
      status: result.status,
      log: result.log,
      output: result.output,
      error: result.error ?? null,
      finished_at: new Date().toISOString(),
    }).eq("id", runId);

    await supabaseAdmin.from("dante_workflows").update({
      last_run_at: new Date().toISOString(),
      last_run_status: result.status,
    }).eq("id", workflowId);

    logAuditEvent({
      workspaceId: profile.workspace_id,
      actorUserId: user.id,
      actorKind: "user",
      action: result.status === "error" ? "workflow.failed" : "workflow.completed",
      entityType: "dante_workflow",
      entityId: workflowId,
      metadata: {
        run_id: runId,
        workflow_name: definition.name,
        status: result.status,
        ...(result.error ? { error: result.error.slice(0, 500) } : {}),
      },
      request,
    });

    if (result.status === "error") {
      notifyRunFailure({
        workflowId,
        workflowName: definition.name,
        workspaceId: profile.workspace_id,
        runId: runId!,
        error: result.error || "Unknown error",
      }).catch(() => {});
    }

    return NextResponse.json({ run_id: runId, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Run failed";
    await supabaseAdmin.from("dante_workflow_runs").update({
      status: "error",
      error: msg,
      finished_at: new Date().toISOString(),
    }).eq("id", runId);

    logAuditEvent({
      workspaceId: profile.workspace_id,
      actorUserId: user.id,
      actorKind: "user",
      action: "workflow.failed",
      entityType: "dante_workflow",
      entityId: workflowId,
      metadata: { run_id: runId, workflow_name: wf.name, error: msg.slice(0, 500) },
      request,
    });

    notifyRunFailure({
      workflowId,
      workflowName: wf.name,
      workspaceId: profile.workspace_id,
      runId: runId!,
      error: msg,
    }).catch(() => {});

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

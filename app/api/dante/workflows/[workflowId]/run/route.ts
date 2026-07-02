// app/api/dante/workflows/[workflowId]/run/route.ts
//
// POST -> kick off a run of this workflow via n8n.
//
// All workflows execute through the n8n engine. Results come back
// via the callback endpoint (POST /api/dante/n8n/execution-callback).

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";
import { requireActiveBilling } from "@/lib/billing/gate";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel Pro

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

  let n8nId = (wf as Record<string, unknown>).n8n_workflow_id as string | null;

  // JIT push: if the workflow was never synced to n8n (e.g. AI-generated,
  // failed earlier push), convert and push now before executing.
  if (!n8nId) {
    try {
      const graph = (wf as Record<string, unknown>).graph as Record<string, unknown> | null;
      if (!graph) {
        return NextResponse.json(
          { error: "Workflow has no graph definition." },
          { status: 400 },
        );
      }
      const n8nBridge = await import("@/lib/dante/n8n-bridge");

      // Detect format: n8n-native has `connections`, Drift has `edges`
      const isN8nNative = !!graph.connections || (Array.isArray(graph.nodes) && !Array.isArray(graph.edges));
      let n8nJson: import("@/lib/dante/n8n-types").N8nWorkflowJSON;

      if (isN8nNative) {
        n8nJson = graph as unknown as import("@/lib/dante/n8n-types").N8nWorkflowJSON;
      } else {
        const { convertDriftToN8n } = await import("@/lib/dante/n8n-converter");
        const conversion = convertDriftToN8n(
          graph as unknown as import("@/lib/dante/workflow-types").WorkflowGraph,
          (wf as Record<string, unknown>).name as string || "Untitled",
        );
        n8nJson = conversion.workflow;
      }

      // Convert trigger to webhook with Drift workflow ID as path
      n8nBridge.patchGraphTrigger(n8nJson.nodes, workflowId, n8nJson.connections as Parameters<typeof n8nBridge.patchGraphTrigger>[2]);
      n8nBridge.patchGraphCredentials(n8nJson.nodes);

      n8nId = await n8nBridge.createWorkspaceWorkflow(
        profile.workspace_id,
        { ...n8nJson, active: true },
      );
      // Persist so we don't JIT-push again next time
      await supabaseAdmin
        .from("dante_workflows")
        .update({ n8n_workflow_id: n8nId })
        .eq("id", workflowId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to push workflow to n8n";
      return NextResponse.json(
        { error: `Workflow has no n8n engine ID and auto-push failed: ${msg}` },
        { status: 400 },
      );
    }
  }

  try {
    const n8nBridge = await import("@/lib/dante/n8n-bridge");

    // Execute via webhook. The webhook path is the Drift workflow ID,
    // so the URL is  {N8N_BASE_URL}/webhook/{workflowId}.
    //
    // Fallback chain on 404 (webhook not registered):
    //   1. Try ensureWebhookTrigger to patch the existing n8n workflow
    //   2. If that still 404s (e.g. n8n workflow is broken/incomplete),
    //      delete the stale n8n workflow and re-push from the Drift graph
    let executionId: string;
    try {
      executionId = await n8nBridge.executeAsync(workflowId, input);
    } catch (webhookErr) {
      const is404 =
        webhookErr instanceof Error &&
        (webhookErr.message.includes("404") || webhookErr.message.includes("not found"));
      if (!is404) throw webhookErr;

      // Attempt 1: patch the trigger node on the existing n8n workflow,
      // then force webhook re-registration (n8n can report active:true
      // while the production webhook is unregistered).
      try {
        await n8nBridge.ensureWebhookTrigger(n8nId, workflowId);
        try { await n8nBridge.reactivateWorkflow(n8nId); } catch { /* non-fatal */ }
        executionId = await n8nBridge.executeAsync(workflowId, input);
      } catch (retryErr) {
        const stillFailed =
          retryErr instanceof Error &&
          (retryErr.message.includes("404") || retryErr.message.includes("not found"));
        if (!stillFailed) throw retryErr;

        // Attempt 2: the n8n workflow is broken (e.g. missing nodes).
        // Delete it and re-push the full graph from the Drift DB.
        try { await n8nBridge.deleteWorkflow(n8nId); } catch { /* best-effort */ }

        const graph = (wf as Record<string, unknown>).graph as Record<string, unknown> | null;
        if (!graph) throw new Error("Workflow has no graph to re-push");

        const isN8nNative = !!graph.connections || (Array.isArray(graph.nodes) && !Array.isArray(graph.edges));
        let freshJson: import("@/lib/dante/n8n-types").N8nWorkflowJSON;
        if (isN8nNative) {
          freshJson = graph as unknown as import("@/lib/dante/n8n-types").N8nWorkflowJSON;
        } else {
          const { convertDriftToN8n } = await import("@/lib/dante/n8n-converter");
          freshJson = convertDriftToN8n(
            graph as unknown as import("@/lib/dante/workflow-types").WorkflowGraph,
            (wf as Record<string, unknown>).name as string || "Untitled",
          ).workflow;
        }

        // Convert trigger to webhook with correct path + real credentials
        n8nBridge.patchGraphTrigger(freshJson.nodes, workflowId, freshJson.connections as Parameters<typeof n8nBridge.patchGraphTrigger>[2]);
        n8nBridge.patchGraphCredentials(freshJson.nodes);
        const freshN8nId = await n8nBridge.createWorkspaceWorkflow(
          profile.workspace_id,
          { ...freshJson, active: true },
        );
        await supabaseAdmin
          .from("dante_workflows")
          .update({ n8n_workflow_id: freshN8nId })
          .eq("id", workflowId);
        n8nId = freshN8nId;

        executionId = await n8nBridge.executeAsync(workflowId, input);
      }
    }

    // Record the run
    const { data: runRow } = await supabaseAdmin
      .from("dante_workflow_runs")
      .insert({
        workflow_id: workflowId,
        workspace_id: profile.workspace_id,
        triggered_by: user.id,
        status: "running",
        input,
        n8n_execution_id: executionId,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    logAuditEvent({
      workspaceId: profile.workspace_id,
      actorUserId: user.id,
      actorKind: "user",
      action: "workflow.queued",
      entityType: "dante_workflow",
      entityId: workflowId,
      metadata: {
        run_id: runRow?.id,
        n8n_execution_id: executionId,
        workflow_name: wf.name,
        engine: "n8n",
      },
      request,
    });

    return NextResponse.json({
      run_id: runRow?.id || executionId,
      n8n_execution_id: executionId,
      status: "running",
      engine: "n8n",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "n8n execution failed";
    return NextResponse.json({ error: msg, engine: "n8n" }, { status: 500 });
  }
}

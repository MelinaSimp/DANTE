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

      n8nId = await n8nBridge.createWorkspaceWorkflow(profile.workspace_id, n8nJson);
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

    // Ensure workflow is active on n8n (non-fatal if activation fails
    // due to custom node types not being installed yet)
    try {
      await n8nBridge.activateWorkflow(n8nId);
    } catch {
      // Activation may fail for workflows with custom nodes -- proceed anyway
    }

    // Execute via API
    const executionId = await n8nBridge.executeWorkflowById(n8nId, input);

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

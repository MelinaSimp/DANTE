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

  const n8nId = (wf as Record<string, unknown>).n8n_workflow_id as string | null;
  if (!n8nId) {
    return NextResponse.json(
      { error: "Workflow has no n8n engine ID. Please re-create this workflow." },
      { status: 400 },
    );
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

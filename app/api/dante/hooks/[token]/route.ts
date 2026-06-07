// app/api/dante/hooks/[token]/route.ts
//
// Public webhook receiver for workflows with a trigger_webhook node.
// Looks up the workflow's n8n_workflow_id and triggers execution via
// the n8n bridge. The request body is passed as workflow input.
//
// Auth: the token itself is the secret. We look up dante_webhook_tokens
// via the service-role client so workspaces are still scoped without
// needing a user session.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const { data: tokenRow } = await supabaseAdmin
    .from("dante_webhook_tokens")
    .select("token, workflow_id, workspace_id")
    .eq("token", token)
    .maybeSingle();
  if (!tokenRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: wf } = await supabaseAdmin
    .from("dante_workflows")
    .select("id, workspace_id, enabled, n8n_workflow_id")
    .eq("id", tokenRow.workflow_id)
    .maybeSingle();
  if (!wf || !wf.enabled) {
    return NextResponse.json({ error: "Workflow disabled" }, { status: 403 });
  }

  const n8nId = wf.n8n_workflow_id as string | null;
  if (!n8nId) {
    return NextResponse.json({ error: "Workflow not migrated to n8n" }, { status: 400 });
  }

  const input = await request.json().catch(() => ({}));

  try {
    const n8nBridge = await import("@/lib/dante/n8n-bridge");
    const executionId = await n8nBridge.executeWorkflowById(n8nId, {
      ...input,
      _trigger: "webhook",
    });

    // Record the run
    const { data: runRow } = await supabaseAdmin
      .from("dante_workflow_runs")
      .insert({
        workflow_id: wf.id,
        workspace_id: wf.workspace_id,
        triggered_by: null,
        status: "running",
        input: { ...input, _trigger: "webhook" },
        n8n_execution_id: executionId,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    return NextResponse.json({
      run_id: runRow?.id || executionId,
      n8n_execution_id: executionId,
      status: "running",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Execution failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

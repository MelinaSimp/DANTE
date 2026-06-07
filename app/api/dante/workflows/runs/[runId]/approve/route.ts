// app/api/dante/workflows/runs/[runId]/approve/route.ts
//
// POST -> approve or reject a paused workflow run.
//
// With n8n, approval-gated workflows use the DriftApprovalGate node
// which pauses execution using n8n's "Wait" mechanism. When approved,
// we resume the n8n execution via its webhook-waiting endpoint.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const body = await req.json();
  const action = body.action as "approve" | "reject";
  const reason = (body.reason as string) || undefined;
  const token = (body.token as string) || undefined;

  if (!action || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  const sb = supabaseAdmin;

  const { data: run } = await sb
    .from("dante_workflow_runs")
    .select("id, workspace_id, workflow_id, status, n8n_execution_id, paused_at_node, approval_context")
    .eq("id", runId)
    .single();

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (run.status !== "waiting_approval") {
    return NextResponse.json({ error: "Run is not waiting for approval" }, { status: 409 });
  }

  // Validate approval token if provided
  if (token) {
    const { data: tok } = await sb
      .from("dante_approval_tokens")
      .select("id, action, expires_at, used_at, workspace_id, run_id")
      .eq("token", token)
      .eq("run_id", runId)
      .single();

    if (!tok) {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }
    if (tok.workspace_id !== run.workspace_id) {
      return NextResponse.json({ error: "Token workspace mismatch" }, { status: 403 });
    }
    if (tok.used_at) {
      return NextResponse.json({ error: "Token already used" }, { status: 409 });
    }
    if (new Date(tok.expires_at) < new Date()) {
      return NextResponse.json({ error: "Token expired" }, { status: 410 });
    }

    await sb
      .from("dante_approval_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", tok.id);
  }

  // Resume the n8n execution if we have an execution ID
  const n8nExecutionId = run.n8n_execution_id as string | null;
  if (n8nExecutionId) {
    try {
      const n8nBaseUrl = process.env.DRIFT_N8N_BASE_URL?.replace(/\/$/, "");
      if (n8nBaseUrl) {
        // Resume the waiting webhook in n8n
        const webhookUrl = `${n8nBaseUrl}/webhook-waiting/approval/${n8nExecutionId}`;
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reason }),
        });
      }
    } catch {
      // Non-fatal -- update local state regardless
    }
  }

  // Update local run state
  const finalStatus = action === "approve" ? "running" : "rejected";
  await sb
    .from("dante_workflow_runs")
    .update({
      status: finalStatus,
      approval_context: { action, reason, approved_at: new Date().toISOString() },
      finished_at: action === "reject" ? new Date().toISOString() : null,
    })
    .eq("id", run.id);

  return NextResponse.json({ ok: true, status: finalStatus });
}

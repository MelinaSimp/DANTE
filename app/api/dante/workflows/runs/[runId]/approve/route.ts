import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resumeWorkflow } from "@/lib/dante/workflow-runner";
import { definitionFromRow } from "@/lib/dante/workflow-types";

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
    .select("id, workspace_id, workflow_id, status, paused_at_node, approval_context")
    .eq("id", runId)
    .single();

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (run.status !== "waiting_approval") {
    return NextResponse.json({ error: "Run is not waiting for approval" }, { status: 409 });
  }

  if (token) {
    // Pull workspace_id on the token too so we can enforce that the
    // token was minted for THIS run's workspace. Previously the lookup
    // only joined token + run_id, which left a theoretical (UUID
    // collision required, very low probability) cross-workspace
    // approval leak. Now: token must match the URL's runId AND its
    // workspace_id must match the run's workspace_id.
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
      // Defense in depth — should be impossible given the token was
      // minted for this run_id, but if a future migration ever lets
      // run_ids be reused or copied across workspaces this guards it.
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

  const { data: wfRow } = await sb
    .from("dante_workflows")
    .select("*")
    .eq("id", run.workflow_id)
    .single();

  if (!wfRow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const workflow = definitionFromRow(wfRow);

  const result = await resumeWorkflow(
    workflow,
    run.paused_at_node,
    run.approval_context ?? {},
    { action, reason },
    { runId: run.id },
  );

  const finalStatus = result.status === "waiting_approval" ? "waiting_approval"
    : result.status === "error" ? "error"
    : "completed";

  await sb
    .from("dante_workflow_runs")
    .update({
      status: finalStatus,
      result,
      paused_at_node: result.paused_at_node ?? null,
      approval_context: result.approval_context ?? null,
      finished_at: finalStatus !== "waiting_approval" ? new Date().toISOString() : null,
    })
    .eq("id", run.id);

  return NextResponse.json({ ok: true, status: finalStatus, result });
}

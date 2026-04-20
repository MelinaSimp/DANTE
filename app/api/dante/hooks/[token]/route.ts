// app/api/dante/hooks/[token]/route.ts
//
// Public webhook receiver for workflows with a trigger_webhook node.
// Any POST to this URL kicks off the owning workflow synchronously.
// The request body is passed as the run `input`, so downstream nodes
// can reference {{steps.<trigger_id>.input.<field>}}.
//
// Auth: the token itself is the secret. We look up dante_webhook_tokens
// via the service-role client so workspaces are still scoped without
// needing a user session.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runWorkflow } from "@/lib/dante/workflow-runner";
import { definitionFromRow } from "@/lib/dante/workflow-types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    .select("*")
    .eq("id", tokenRow.workflow_id)
    .maybeSingle();
  if (!wf || !wf.enabled) {
    return NextResponse.json({ error: "Workflow disabled" }, { status: 403 });
  }

  const input = await request.json().catch(() => ({}));

  const { data: run } = await supabaseAdmin
    .from("dante_workflow_runs")
    .insert({
      workflow_id: wf.id,
      workspace_id: wf.workspace_id,
      status: "running",
      input,
    })
    .select()
    .single();

  try {
    const definition = definitionFromRow(wf);
    const result = await runWorkflow(definition, input);

    await supabaseAdmin.from("dante_workflow_runs").update({
      status: result.status,
      log: result.log,
      output: result.output,
      error: result.error ?? null,
      finished_at: new Date().toISOString(),
    }).eq("id", run?.id);

    await supabaseAdmin.from("dante_workflows").update({
      last_run_at: new Date().toISOString(),
      last_run_status: result.status,
    }).eq("id", wf.id);

    return NextResponse.json({ run_id: run?.id, status: result.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Run failed";
    await supabaseAdmin.from("dante_workflow_runs").update({
      status: "error",
      error: msg,
      finished_at: new Date().toISOString(),
    }).eq("id", run?.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

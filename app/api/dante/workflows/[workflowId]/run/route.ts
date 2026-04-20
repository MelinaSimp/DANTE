// app/api/dante/workflows/[workflowId]/run/route.ts
//
// POST → kick off a run of this workflow. Executes synchronously and
// returns the full log + output. Long-running steps should lean on
// the `delay` cap or move to a phase-2 background queue — this route
// is not durable past the HTTP timeout.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runWorkflow } from "@/lib/dante/workflow-runner";
import { definitionFromRow } from "@/lib/dante/workflow-types";

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

  const body = await request.json().catch(() => ({}));
  const input = (body.input && typeof body.input === "object") ? body.input : {};

  // Pre-insert a "running" row so the UI shows live state if polled.
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

    return NextResponse.json({ run_id: runId, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Run failed";
    await supabaseAdmin.from("dante_workflow_runs").update({
      status: "error",
      error: msg,
      finished_at: new Date().toISOString(),
    }).eq("id", runId);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

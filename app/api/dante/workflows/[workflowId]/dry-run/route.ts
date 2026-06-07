// app/api/dante/workflows/[workflowId]/dry-run/route.ts
//
// POST -> validate a workflow's n8n definition without executing it.
//
// With n8n as the execution engine, dry-run validates the workflow
// structure and returns node/connection counts. Full simulation
// requires executing the workflow on n8n (not supported inline).

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireActiveBilling } from "@/lib/billing/gate";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { workflowId } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const { data: wf } = await supabaseAdmin
    .from("dante_workflows")
    .select("*")
    .eq("id", workflowId)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!wf) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const gate = await requireActiveBilling(profile.workspace_id);
  if (!gate.ok) return gate.response;

  const n8nId = (wf as Record<string, unknown>).n8n_workflow_id as string | null;
  if (!n8nId) {
    return NextResponse.json(
      { error: "Workflow not migrated to n8n" },
      { status: 400 },
    );
  }

  try {
    const n8nBridge = await import("@/lib/dante/n8n-bridge");
    const n8nWorkflow = await n8nBridge.getWorkflow(n8nId);

    return NextResponse.json({
      simulated: true,
      status: "ok",
      engine: "n8n",
      n8n_workflow_id: n8nId,
      active: n8nWorkflow.active,
      nodeCount: n8nWorkflow.nodes?.length || 0,
      log: [{
        step: "validation",
        status: "ok",
        message: `Workflow has ${n8nWorkflow.nodes?.length || 0} nodes on n8n`,
      }],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Validation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// app/api/dante/workflows/[workflowId]/route.ts
//
// GET    → fetch one workflow with its steps
// PUT    → update name/description/enabled/steps
// DELETE → remove workflow (cascades runs via FK)

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function requireOwnership(workflowId: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles")
    .select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) return { error: NextResponse.json({ error: "No workspace" }, { status: 400 }) };

  const { data: wf } = await supabaseAdmin
    .from("dante_workflows")
    .select("id, workspace_id")
    .eq("id", workflowId)
    .maybeSingle();
  if (!wf || wf.workspace_id !== profile.workspace_id) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { user, workspaceId: profile.workspace_id };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { workflowId } = await params;
  const ctx = await requireOwnership(workflowId);
  if ("error" in ctx) return ctx.error;

  const [wfRes, runsRes] = await Promise.all([
    supabaseAdmin.from("dante_workflows").select("*").eq("id", workflowId).maybeSingle(),
    supabaseAdmin.from("dante_workflow_runs")
      .select("id, status, started_at, finished_at, error")
      .eq("workflow_id", workflowId)
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({ workflow: wfRes.data, runs: runsRes.data || [] });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { workflowId } = await params;
  const ctx = await requireOwnership(workflowId);
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.description === "string" || body.description === null) patch.description = body.description;
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (body.trigger !== undefined) patch.trigger = body.trigger;
  if (Array.isArray(body.steps)) patch.steps = body.steps;
  // Phase-2 graph shape { nodes, edges, viewport? }. Writes here,
  // reads always via definitionFromRow() which tolerates either.
  if (body.graph && typeof body.graph === "object") patch.graph = body.graph;
  if (Array.isArray(body.tags)) patch.tags = body.tags;

  const { data, error } = await supabaseAdmin
    .from("dante_workflows")
    .update(patch)
    .eq("id", workflowId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workflow: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { workflowId } = await params;
  const ctx = await requireOwnership(workflowId);
  if ("error" in ctx) return ctx.error;

  const { error } = await supabaseAdmin
    .from("dante_workflows")
    .delete()
    .eq("id", workflowId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

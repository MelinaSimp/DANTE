// app/api/dante/workflows/[workflowId]/route.ts
//
// GET    → fetch one workflow with its steps
// PUT    → update name/description/enabled/steps + sync graph to n8n
// DELETE → remove workflow (cascades runs via FK) + clean up n8n

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Detect whether a graph object is n8n-native format (has `connections`)
 * versus Drift internal format (has `edges`).
 */
function isN8nNativeGraph(graph: Record<string, unknown>): boolean {
  return !!graph.connections || (Array.isArray(graph.nodes) && !Array.isArray(graph.edges));
}

/**
 * Best-effort sync of the workflow graph to n8n. Non-fatal -- if n8n is
 * unreachable the DB save still succeeds and the run endpoint's JIT push
 * catches any missed syncs.
 */
async function syncToN8n(
  workflowId: string,
  workspaceId: string,
  graph: Record<string, unknown>,
  n8nWorkflowId: string | null,
  name: string,
): Promise<void> {
  try {
    const n8nBridge = await import("@/lib/dante/n8n-bridge");

    if (n8nWorkflowId) {
      // Existing n8n workflow -- push updated graph
      const n8nJson = isN8nNativeGraph(graph)
        ? graph
        : await convertGraph(graph, name);
      if (n8nJson) {
        const nodes = (n8nJson as Record<string, unknown>).nodes;
        if (Array.isArray(nodes)) {
          n8nBridge.patchGraphTrigger(nodes, workflowId);
          n8nBridge.patchGraphCredentials(nodes);
        }
        await n8nBridge.updateWorkflow(n8nWorkflowId, n8nJson as unknown as import("@/lib/dante/n8n-types").N8nWorkflowJSON);
        // Ensure webhook is registered after update
        try { await n8nBridge.ensureWebhookTrigger(n8nWorkflowId, workflowId); } catch { /* non-fatal */ }
      }
    } else if (graph) {
      // No n8n ID yet -- convert + create
      const n8nJson = isN8nNativeGraph(graph)
        ? graph
        : await convertGraph(graph, name);
      if (n8nJson) {
        const nodes = (n8nJson as Record<string, unknown>).nodes;
        if (Array.isArray(nodes)) {
          n8nBridge.patchGraphTrigger(nodes, workflowId);
          n8nBridge.patchGraphCredentials(nodes);
        }
        const typed = n8nJson as unknown as import("@/lib/dante/n8n-types").N8nWorkflowJSON;
        const newId = await n8nBridge.createWorkspaceWorkflow(
          workspaceId,
          { ...typed, active: true },
        );
        // Store the n8n ID back on the Drift row
        await supabaseAdmin
          .from("dante_workflows")
          .update({ n8n_workflow_id: newId })
          .eq("id", workflowId);
      }
    }
  } catch (err) {
    // Non-fatal: log but don't block the save response
    console.error("[workflow-save] n8n sync failed:", err instanceof Error ? err.message : err);
  }
}

async function convertGraph(
  graph: Record<string, unknown>,
  name: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { convertDriftToN8n } = await import("@/lib/dante/n8n-converter");
    const result = convertDriftToN8n(
      graph as unknown as import("@/lib/dante/workflow-types").WorkflowGraph,
      name,
    );
    return result.workflow as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
}

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

  // Best-effort sync to n8n (non-blocking for the response)
  if (data?.graph && typeof data.graph === "object") {
    const row = data as Record<string, unknown>;
    syncToN8n(
      workflowId,
      ctx.workspaceId,
      row.graph as Record<string, unknown>,
      (row.n8n_workflow_id as string) || null,
      (row.name as string) || "Untitled",
    ).catch(() => {}); // fire-and-forget, errors already logged inside
  }

  return NextResponse.json({ workflow: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { workflowId } = await params;
  const ctx = await requireOwnership(workflowId);
  if ("error" in ctx) return ctx.error;

  // Fetch n8n_workflow_id before deleting so we can clean up n8n
  const { data: wf } = await supabaseAdmin
    .from("dante_workflows")
    .select("n8n_workflow_id")
    .eq("id", workflowId)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("dante_workflows")
    .delete()
    .eq("id", workflowId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Best-effort n8n cleanup
  const n8nId = (wf as Record<string, unknown> | null)?.n8n_workflow_id as string | null;
  if (n8nId) {
    import("@/lib/dante/n8n-bridge")
      .then((bridge) => bridge.deleteWorkflow(n8nId))
      .catch((err) => console.error("[workflow-delete] n8n cleanup failed:", err instanceof Error ? err.message : err));
  }

  return NextResponse.json({ ok: true });
}

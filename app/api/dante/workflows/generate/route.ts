// app/api/dante/workflows/generate/route.ts
//
// POST → natural-language prompt → newly-created workflow in this
// workspace. Returns { workflow } so the client can push straight
// into the editor.
//
// The heavy lifting lives in lib/dante/workflow-ai.ts. This route
// just glues auth + DB insert around it.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateWorkflow } from "@/lib/dante/workflow-ai";
import { requireActiveBilling } from "@/lib/billing/gate";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const gate = await requireActiveBilling(profile.workspace_id);
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

  let generated;
  try {
    generated = await generateWorkflow(prompt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Generation failed";
    // 422 because the request was syntactically valid but the model
    // couldn't produce a runnable graph.
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  // Derive the simple top-level trigger tag from the graph's trigger node.
  const triggerNode = generated.graph.nodes.find((n) => n.type.startsWith("trigger_"));
  const triggerTag = triggerNode?.type === "trigger_cron"    ? { type: "cron" }    :
                     triggerNode?.type === "trigger_webhook" ? { type: "webhook" } :
                                                               { type: "manual" };

  // Cron and webhook-triggered workflows start disabled so the user
  // can review the generated graph before it fires. Manual-trigger
  // workflows are harmless (user must click Run) so they start enabled.
  const autoEnable = triggerTag.type === "manual";

  const { data, error } = await supabaseAdmin
    .from("dante_workflows")
    .insert({
      workspace_id: profile.workspace_id,
      created_by: user.id,
      name: generated.name,
      description: generated.description || null,
      trigger: triggerTag,
      enabled: autoEnable,
      steps: [], // legacy column — graph is the source of truth now
      graph: generated.graph,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Best-effort push to n8n so the workflow is immediately runnable.
  // If this fails the JIT fallback in the run endpoint catches it.
  if (data?.id && data.graph) {
    try {
      const { convertDriftToN8n } = await import("@/lib/dante/n8n-converter");
      const n8nBridge = await import("@/lib/dante/n8n-bridge");
      const conversion = convertDriftToN8n(
        generated.graph,
        generated.name,
      );

      // Convert trigger to webhook with Drift workflow ID as path
      n8nBridge.patchGraphTrigger(conversion.workflow.nodes, data.id, conversion.workflow.connections as Parameters<typeof n8nBridge.patchGraphTrigger>[2]);
      n8nBridge.patchGraphCredentials(conversion.workflow.nodes);

      const n8nId = await n8nBridge.createWorkspaceWorkflow(
        profile.workspace_id,
        { ...conversion.workflow, active: true },
      );
      await supabaseAdmin
        .from("dante_workflows")
        .update({ n8n_workflow_id: n8nId })
        .eq("id", data.id);
      // Patch the response so the client has the n8n ID immediately
      data.n8n_workflow_id = n8nId;
    } catch (err) {
      console.error("[workflow-generate] n8n push failed:", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ workflow: data, prompt });
}

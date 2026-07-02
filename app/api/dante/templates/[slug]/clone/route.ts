// app/api/dante/templates/[slug]/clone/route.ts
//
// POST /api/dante/templates/<slug>/clone
//
// Clones a pre-built workflow template (see lib/dante/templates.ts)
// into the caller's workspace as a fresh, disabled workflow. The
// graph is deep-copied so the template registry can't be mutated
// through a later edit in the canvas. Returns the new workflow row
// so the client can redirect straight into the editor.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getTemplate } from "@/lib/dante/templates";
import { getN8nTemplate } from "@/lib/dante/n8n-templates";
import { convertDriftToN8n } from "@/lib/dante/n8n-converter";
import * as n8nBridge from "@/lib/dante/n8n-bridge";
import type { StepType, WorkflowGraph } from "@/lib/dante/workflow-types";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// Map the trigger node's step type to the workflow row's `trigger`
// column shape — this is what the scheduler + webhook dispatch read
// to decide how a run gets kicked off.
function triggerFromNode(type: StepType): { type: "manual" | "cron" | "webhook" } {
  if (type === "trigger_cron") return { type: "cron" };
  if (type === "trigger_webhook") return { type: "webhook" };
  return { type: "manual" };
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles")
    .select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  // Check for hand-crafted n8n template first (Phase 1 — top 5)
  const n8nTemplate = getN8nTemplate(slug);

  // Fall back to legacy template
  const template = n8nTemplate ? null : getTemplate(slug);
  if (!n8nTemplate && !template) {
    return NextResponse.json({ error: `Unknown template: ${slug}` }, { status: 404 });
  }

  // Get the n8n workflow JSON -- either from hand-crafted template or auto-conversion
  let workflowJson;
  let name: string;
  let description: string;

  if (n8nTemplate) {
    workflowJson = structuredClone(n8nTemplate.workflow);
    name = n8nTemplate.name;
    description = n8nTemplate.description;
  } else {
    // Auto-convert the legacy template to n8n format
    const conversion = convertDriftToN8n(template!.graph, template!.name);
    workflowJson = conversion.workflow;
    name = template!.name;
    description = template!.description;
  }

  // Determine trigger type from n8n nodes
  const triggerNode = workflowJson.nodes.find(
    (n) => n.type.includes("Trigger") || n.type.includes("trigger") || n.type.includes("webhook"),
  );
  const trigger = triggerNode
    ? triggerNode.type.includes("scheduleTrigger") ? { type: "cron" as const }
      : triggerNode.type.includes("webhook") ? { type: "webhook" as const }
      : { type: "manual" as const }
    : { type: "manual" as const };

  // For cron-triggered templates, inject the cloning user's email in
  // place of the "broker@yourfirm.com" placeholder. This way each
  // cloned workflow has the correct recipient without requiring n8n
  // env var provisioning per workspace.
  if (trigger.type === "cron") {
    const { data: userEmail } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle();
    const email = userEmail?.email || user.email;
    if (email) {
      for (const node of workflowJson.nodes) {
        const params = node.parameters as Record<string, unknown> | undefined;
        if (params) {
          for (const [key, val] of Object.entries(params)) {
            if (typeof val === "string" && val.includes("broker@yourfirm.com")) {
              (params as Record<string, string>)[key] = val.replace("broker@yourfirm.com", email);
            }
          }
        }
      }
    }
  }

  // Generate the Drift workflow ID upfront so we can set the webhook
  // path before pushing to n8n. This makes the webhook URL deterministic:
  // {N8N_BASE_URL}/webhook/{driftWorkflowId}
  const driftWorkflowId = crypto.randomUUID();

  // Convert trigger to webhook with the Drift workflow ID as path.
  // Handles manualTrigger, scheduleTrigger, or webhook with placeholder.
  n8nBridge.patchGraphTrigger(workflowJson.nodes, driftWorkflowId, workflowJson.connections as Parameters<typeof n8nBridge.patchGraphTrigger>[2]);

  // Replace placeholder credential IDs with real n8n credential IDs
  // so the workflow can activate (e.g. SMTP, DriftCRE API, OpenAI).
  n8nBridge.patchGraphCredentials(workflowJson.nodes);

  // Push to n8n (best-effort)
  let n8nWorkflowId: string | null = null;
  try {
    n8nWorkflowId = await n8nBridge.createWorkspaceWorkflow(
      profile.workspace_id,
      { ...workflowJson, active: true },
    );
  } catch {
    // Non-fatal -- workflow still gets saved in Drift DB
  }

  const { data, error } = await supabaseAdmin
    .from("dante_workflows")
    .insert({
      id: driftWorkflowId,
      workspace_id: profile.workspace_id,
      created_by: user.id,
      name,
      description,
      trigger,
      steps: workflowJson.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        name: n.name,
        parameters: n.parameters,
      })),
      graph: workflowJson,
      enabled: true,
      n8n_workflow_id: n8nWorkflowId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    workflow: data,
    template_slug: slug,
    engine: "n8n",
    n8n_synced: !!n8nWorkflowId,
  });
}

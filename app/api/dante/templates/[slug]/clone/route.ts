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
import type { StepType, WorkflowGraph } from "@/lib/dante/workflow-types";

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

  const template = getTemplate(slug);
  if (!template) {
    return NextResponse.json({ error: `Unknown template: ${slug}` }, { status: 404 });
  }

  // Deep clone the graph so each workspace gets its own independent
  // copy. structuredClone is available everywhere the Next.js server
  // runs (node >= 17).
  const graph: WorkflowGraph = structuredClone(template.graph);
  const triggerNode = graph.nodes.find((n) =>
    n.type === "trigger_manual" || n.type === "trigger_cron" || n.type === "trigger_webhook"
  );
  const trigger = triggerNode ? triggerFromNode(triggerNode.type) : { type: "manual" as const };

  const { data, error } = await supabaseAdmin
    .from("dante_workflows")
    .insert({
      workspace_id: profile.workspace_id,
      created_by: user.id,
      name: template.name,
      description: template.description,
      trigger,
      // Keep the legacy steps[] column empty — the runner reads from
      // `graph` when it's populated (see definitionFromRow in
      // workflow-types.ts).
      steps: [],
      graph,
      // Cloned workflows start disabled so the user can review the
      // graph (and populate any {{secrets.*}} placeholders) before
      // the scheduler picks it up.
      enabled: false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ workflow: data, template_slug: slug });
}

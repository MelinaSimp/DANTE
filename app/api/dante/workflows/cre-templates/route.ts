// app/api/dante/workflows/cre-templates/route.ts
//
// GET  — list available CRE workflow templates.
// POST — instantiate a CRE template as a new workflow in the workspace.

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CRE_WORKFLOW_TEMPLATES } from "@/lib/dante/cre-workflow-templates";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    CRE_WORKFLOW_TEMPLATES.map((t) => ({
      key: t.key,
      name: t.name,
      description: t.description,
      triggerType: t.trigger.type,
      nodeCount: t.graph.nodes.length,
    })),
  );
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  let body: { template_key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const template = CRE_WORKFLOW_TEMPLATES.find((t) => t.key === body.template_key);
  if (!template) {
    return NextResponse.json({ error: "Unknown template" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("dante_workflows")
    .insert({
      workspace_id: profile.workspace_id,
      created_by: user.id,
      name: template.name,
      description: template.description,
      trigger: template.trigger,
      graph: template.graph,
      steps: [],
      enabled: false,
    })
    .select("id, name")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ workflow: data, template_key: template.key });
}

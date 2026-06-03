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
  if (!wf || wf.workspace_id !== profile.workspace_id)
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { user, workspaceId: profile.workspace_id };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  const { workflowId } = await params;
  const ctx = await requireOwnership(workflowId);
  if ("error" in ctx) return ctx.error;

  const { data, error } = await supabaseAdmin
    .from("dante_workflow_versions")
    .select("id, version, name, description, created_at, created_by")
    .eq("workflow_id", workflowId)
    .order("version", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ versions: data || [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  const { workflowId } = await params;
  const ctx = await requireOwnership(workflowId);
  if ("error" in ctx) return ctx.error;

  const { data: wf } = await supabaseAdmin
    .from("dante_workflows")
    .select("name, description, graph, trigger")
    .eq("id", workflowId)
    .maybeSingle();
  if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: latest } = await supabaseAdmin
    .from("dante_workflow_versions")
    .select("version")
    .eq("workflow_id", workflowId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latest?.version ?? 0) + 1;

  const { data, error } = await supabaseAdmin
    .from("dante_workflow_versions")
    .insert({
      workflow_id: workflowId,
      workspace_id: ctx.workspaceId,
      version: nextVersion,
      name: wf.name,
      description: wf.description,
      graph: wf.graph,
      trigger: wf.trigger,
      created_by: ctx.user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ version: data });
}

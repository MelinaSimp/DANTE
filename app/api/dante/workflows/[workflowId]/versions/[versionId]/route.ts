import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ workflowId: string; versionId: string }> },
) {
  const { workflowId, versionId } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles")
    .select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const { data: ver } = await supabaseAdmin
    .from("dante_workflow_versions")
    .select("*")
    .eq("id", versionId)
    .eq("workflow_id", workflowId)
    .maybeSingle();

  if (!ver || ver.workspace_id !== profile.workspace_id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ version: ver });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ workflowId: string; versionId: string }> },
) {
  const { workflowId, versionId } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles")
    .select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const { data: ver } = await supabaseAdmin
    .from("dante_workflow_versions")
    .select("*")
    .eq("id", versionId)
    .eq("workflow_id", workflowId)
    .maybeSingle();
  if (!ver || ver.workspace_id !== profile.workspace_id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from("dante_workflows")
    .update({
      name: ver.name,
      description: ver.description,
      graph: ver.graph,
      trigger: ver.trigger,
    })
    .eq("id", workflowId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workflow: data });
}

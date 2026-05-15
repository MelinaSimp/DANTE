import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canAccessProject } from "@/lib/vault/project-access";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "no workspace" }, { status: 403 });
  }

  const isLoose = projectId === "loose";

  if (!isLoose && !(await canAccessProject(supabase, user.id, profile.workspace_id, projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let query = supabaseAdmin
    .from("watched_file_index")
    .select("id, file_name, file_path, file_extension, file_size_bytes, ingest_status, created_at")
    .eq("workspace_id", profile.workspace_id)
    .neq("ingest_status", "ingested")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);

  if (isLoose) {
    query = query.is("project_id", null);
  } else {
    query = query.eq("project_id", projectId);
  }

  const { data: files } = await query;

  return NextResponse.json({ files: files || [] });
}

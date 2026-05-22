// app/api/vault/projects/route.ts — list + create vault projects.
//
// Each project is a top-level container that holds many vault_items.
// On the landing, the user sees a grid of project cards (Harvey
// pattern); clicking a project takes them to /vault/projects/[id]
// where the items in that project are listed.

import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { getAccessibleProjectIds } from "@/lib/vault/project-access";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json([]);

  const { isAdmin, projectIds } = await getAccessibleProjectIds(
    supabase,
    user.id,
    profile.workspace_id,
  );

  let projectQuery = supabase
    .from("vault_projects")
    .select("id, name, description, created_at, updated_at")
    .eq("workspace_id", profile.workspace_id)
    .order("updated_at", { ascending: false });

  if (!isAdmin && projectIds) {
    projectQuery = projectQuery.in("id", projectIds.length > 0 ? projectIds : ["00000000-0000-0000-0000-000000000000"]);
  }

  const { data: projects, error } = await projectQuery;

  if (error) {
    console.error("vault projects GET:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }

  // Augment each project with item counts via a single aggregation
  // query instead of downloading every vault_item row.
  const counts = new Map<string, { templates: number; documents: number }>();
  if ((projects || []).length > 0) {
    const { data: rows } = await supabaseAdmin
      .rpc("vault_project_counts", { p_workspace_id: profile.workspace_id });
    for (const r of (rows || []) as Array<{ project_id: string; doc_count: number; template_count: number }>) {
      counts.set(r.project_id, { documents: r.doc_count, templates: r.template_count });
    }
  }

  // Loose-files virtual bucket — anything without a project. Surfaced
  // on the landing as a card so the user can find/move them.
  const { count: looseCount } = await supabase
    .from("vault_items")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", profile.workspace_id)
    .is("project_id", null);

  return NextResponse.json({
    projects: (projects || []).map((p: any) => ({
      ...p,
      counts: counts.get(p.id) || { templates: 0, documents: 0 },
    })),
    loose_count: looseCount ?? 0,
  });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const body = await request.json();
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const { data, error } = await supabase
    .from("vault_projects")
    .insert({
      workspace_id: profile.workspace_id,
      created_by: user.id,
      name,
      description: body.description?.trim() || null,
    })
    .select()
    .single();
  if (error) {
    console.error("vault projects POST:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const { user, profile } = await loadAuth();
  if (!user || !profile) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminRole(profile.role)) {
    return NextResponse.json({ error: "admin_required" }, { status: 403 });
  }

  const { data: project } = await supabaseAdmin
    .from("vault_projects")
    .select("id")
    .eq("id", projectId)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: access } = await supabaseAdmin
    .from("vault_project_access")
    .select("id, profile_id, role, granted_at")
    .eq("project_id", projectId);

  const profileIds = (access || []).map((a: any) => a.profile_id);
  let profiles: Record<string, { full_name: string; role: string }> = {};
  if (profileIds.length > 0) {
    const { data: pRows } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, role")
      .in("id", profileIds);
    for (const p of pRows || []) {
      profiles[p.id] = { full_name: p.full_name, role: p.role };
    }
  }

  const { data: allMembers } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, role")
    .eq("workspace_id", profile.workspace_id)
    .order("full_name");

  return NextResponse.json({
    access: (access || []).map((a: any) => ({
      ...a,
      profile_name: profiles[a.profile_id]?.full_name || "Unknown",
      profile_role: profiles[a.profile_id]?.role || "member",
    })),
    members: (allMembers || []).map((m: any) => ({
      id: m.id,
      full_name: m.full_name,
      role: m.role,
    })),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const { user, profile } = await loadAuth();
  if (!user || !profile) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminRole(profile.role)) {
    return NextResponse.json({ error: "admin_required" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const profileId = body.profile_id;
  const accessRole = body.role || "viewer";
  if (!profileId) {
    return NextResponse.json({ error: "profile_id required" }, { status: 400 });
  }

  const { data: target } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", profileId)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "profile not in workspace" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("vault_project_access")
    .upsert(
      {
        project_id: projectId,
        profile_id: profileId,
        role: accessRole,
        granted_by: user.id,
      },
      { onConflict: "project_id,profile_id" },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: profile.workspace_id,
    actor_id: user.id,
    action: "vault_project_access.granted",
    target_type: "vault_project_access",
    target_id: data.id,
    metadata: { project_id: projectId, profile_id: profileId, role: accessRole },
  });

  return NextResponse.json(data);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const { user, profile } = await loadAuth();
  if (!user || !profile) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminRole(profile.role)) {
    return NextResponse.json({ error: "admin_required" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get("profile_id");
  if (!profileId) {
    return NextResponse.json({ error: "profile_id required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("vault_project_access")
    .delete()
    .eq("project_id", projectId)
    .eq("profile_id", profileId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: profile.workspace_id,
    actor_id: user.id,
    action: "vault_project_access.revoked",
    target_type: "vault_project",
    target_id: projectId,
    metadata: { profile_id: profileId },
  });

  return NextResponse.json({ ok: true });
}

function isAdminRole(role: string): boolean {
  return role === "owner" || role === "admin";
}

async function loadAuth() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return { user: null, profile: null };
  return {
    user,
    profile: profile as { workspace_id: string; role: string; is_superadmin: boolean },
  };
}

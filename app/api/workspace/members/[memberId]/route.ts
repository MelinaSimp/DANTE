import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { can, normalizeRole, type WorkspaceRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES: WorkspaceRole[] = ["owner", "admin", "member"];

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ memberId: string }> },
) {
  const { memberId } = await ctx.params;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: caller } = await supabase
    .from("profiles")
    .select("id, workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!caller?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  if (!can(caller.role, "workspace.change_member_role")) {
    return NextResponse.json(
      { error: "Only owners can change roles." },
      { status: 403 },
    );
  }
  if (caller.id === memberId) {
    return NextResponse.json(
      { error: "You can't change your own role." },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const newRole = normalizeRole(body.role);
  if (!ALLOWED_ROLES.includes(newRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const { data: target } = await supabaseAdmin
    .from("profiles")
    .select("id, workspace_id, role")
    .eq("id", memberId)
    .maybeSingle();
  if (!target || target.workspace_id !== caller.workspace_id) {
    return NextResponse.json(
      { error: "Member not found in this workspace." },
      { status: 404 },
    );
  }

  if (target.role === "owner" && newRole !== "owner") {
    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", caller.workspace_id)
      .eq("role", "owner");
    if ((count || 0) <= 1) {
      return NextResponse.json(
        {
          error:
            "Can't demote the only owner. Promote another member to owner first.",
        },
        { status: 409 },
      );
    }
  }

  const { error: updErr } = await supabaseAdmin
    .from("profiles")
    .update({ role: newRole })
    .eq("id", memberId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: caller.workspace_id,
    actor_id: user.id,
    action: "workspace.role_changed",
    target_type: "profile",
    target_id: memberId,
    metadata: { old_role: target.role, new_role: newRole },
  });

  return NextResponse.json({ ok: true, role: newRole });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ memberId: string }> },
) {
  const { memberId } = await ctx.params;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: caller } = await supabase
    .from("profiles")
    .select("id, workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!caller?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  if (!can(caller.role, "workspace.remove_member")) {
    return NextResponse.json(
      { error: "Only owners and admins can remove members." },
      { status: 403 },
    );
  }
  if (caller.id === memberId) {
    return NextResponse.json(
      { error: "Use Settings → Leave workspace to remove yourself." },
      { status: 400 },
    );
  }

  const { data: target } = await supabaseAdmin
    .from("profiles")
    .select("id, workspace_id, role")
    .eq("id", memberId)
    .maybeSingle();
  if (!target || target.workspace_id !== caller.workspace_id) {
    return NextResponse.json(
      { error: "Member not found in this workspace." },
      { status: 404 },
    );
  }

  if (normalizeRole(target.role) === "owner" && normalizeRole(caller.role) !== "owner") {
    return NextResponse.json(
      { error: "Only owners can remove other owners." },
      { status: 403 },
    );
  }

  if (normalizeRole(target.role) === "owner") {
    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", caller.workspace_id)
      .eq("role", "owner");
    if ((count || 0) <= 1) {
      return NextResponse.json(
        {
          error:
            "Can't remove the only owner. Promote another member to owner first.",
        },
        { status: 409 },
      );
    }
  }

  const { error: updErr } = await supabaseAdmin
    .from("profiles")
    .update({ workspace_id: null })
    .eq("id", memberId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: caller.workspace_id,
    actor_id: user.id,
    action: "workspace.member_removed",
    target_type: "profile",
    target_id: memberId,
    metadata: { removed_role: target.role },
  });

  // Best-effort session revoke so any open browser tab the removed
  // member has loses access on the next request. Failure here is
  // not fatal — the workspace_id flip already locks them out of
  // workspace queries server-side.
  try {
    await supabaseAdmin.auth.admin.signOut(memberId, "global");
  } catch (err) {
    console.warn(
      "[members/remove] auth signOut failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json({ ok: true });
}

// app/api/workspace/members/[memberId]/route.ts
//
// DELETE — remove a member from the caller's workspace. Owner /
// admin only. Sets the target's `profiles.workspace_id` to NULL so
// they're effectively logged out of all workspace surfaces (every
// page checks workspace_id and redirects when missing). We also
// best-effort sign them out via auth.admin so an open session
// doesn't keep showing stale workspace data.
//
// Refuse cases:
//   - target is the caller (no self-remove; use Settings → Leave
//     workspace, not built yet)
//   - target is the only owner of the workspace (last-owner
//     protection — the workspace can't be left ownerless)

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

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

  // Last-owner protection — the workspace must always have at least
  // one owner so billing / role changes have somewhere to land.
  if ((target as { role: string | null }).role === "owner") {
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

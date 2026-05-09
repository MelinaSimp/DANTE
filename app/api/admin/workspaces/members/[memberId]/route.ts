// app/api/admin/workspaces/members/[memberId]/route.ts
//
// Superadmin-only endpoint to remove a member from any workspace,
// driven by the All Workspaces admin panel. Different from
// /api/workspace/members/[memberId] which is owner/admin self-serve
// inside their own workspace — this one bypasses workspace
// boundaries because the caller is platform-level admin.
//
// Last-owner protection still applies: the workspace must keep at
// least one owner so it has a billing/management contact.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";

export const dynamic = "force-dynamic";

async function verifySuperadmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!hasSuperadminAccess(user.email, profile?.is_superadmin)) return null;
  return user;
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ memberId: string }> },
) {
  const { memberId } = await ctx.params;
  const admin = await verifySuperadmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: target } = await supabaseAdmin
    .from("profiles")
    .select("id, workspace_id, role")
    .eq("id", memberId)
    .maybeSingle();
  if (!target || !(target as { workspace_id: string | null }).workspace_id) {
    return NextResponse.json(
      { error: "Member not found in any workspace." },
      { status: 404 },
    );
  }
  const wsId = (target as { workspace_id: string }).workspace_id;

  // Last-owner protection — preserve at least one owner per workspace.
  if ((target as { role: string | null }).role === "owner") {
    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", wsId)
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
  // member has loses access on the next request.
  try {
    await supabaseAdmin.auth.admin.signOut(memberId, "global");
  } catch (err) {
    console.warn(
      "[admin/workspaces/members] signOut failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json({ ok: true });
}

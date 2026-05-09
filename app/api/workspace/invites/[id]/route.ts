// app/api/workspace/invites/[id]/route.ts
//
// DELETE — cancel a pending invite. Owner / admin only. Only deletes
// invites belonging to the caller's workspace and that haven't been
// redeemed yet (used_at IS NULL); a redeemed invite is historical
// audit and stays.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  if (!can(profile.role, "workspace.invite_member")) {
    return NextResponse.json(
      { error: "Only owners and admins can cancel invites." },
      { status: 403 },
    );
  }

  const { error, count } = await supabaseAdmin
    .from("invites")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("company_id", profile.workspace_id)
    .is("used_at", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json(
      { error: "Invite not found or already redeemed." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}

// app/api/admin/erasure/execute/route.ts
//
// Runs the erasure after the user pastes back their confirmation
// token (workspace-scope) or immediately (user-scope). Returns the
// signed deletion certificate.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { executeErasure } from "@/lib/erasure/runner";
import { canApprove, type Role } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return jsonError(400, "no_workspace");

  const role = ((profile as { role?: string }).role ?? "advisor") as Role;
  const isSuper = !!(profile as { is_superadmin?: boolean }).is_superadmin;

  const body = (await req.json().catch(() => ({}))) as {
    scope?: "user" | "workspace";
    target_user_id?: string;
    confirmation_token?: string;
  };
  if (body.scope !== "user" && body.scope !== "workspace") {
    return jsonError(400, "scope must be user|workspace");
  }

  try {
    if (body.scope === "user") {
      const targetUserId = body.target_user_id ?? user.id;
      // Self-erasure always allowed; targeting another user requires admin.
      if (targetUserId !== user.id && !isSuper && !canApprove(role)) {
        return jsonError(403, "admin_only_for_other_user_erasure");
      }
      const result = await executeErasure({
        scope: "user",
        userId: targetUserId,
        workspaceId: profile.workspace_id,
        initiatedBy: user.id,
      });
      return NextResponse.json(result);
    }

    // Workspace scope.
    if (!isSuper && !canApprove(role)) {
      return jsonError(403, "admin_or_supervisor_only");
    }
    if (!body.confirmation_token) {
      return jsonError(400, "confirmation_token required");
    }
    const result = await executeErasure({
      scope: "workspace",
      workspaceId: profile.workspace_id,
      initiatedBy: user.id,
      confirmationToken: body.confirmation_token,
    });
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : "erasure_failed");
  }
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

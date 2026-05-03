// app/api/admin/erasure/request/route.ts
//
// Two-step erasure flow:
//
//   POST /api/admin/erasure/request   { scope: "user"|"workspace", target?: userId }
//     → registers an erasure_request row, returns a confirmation token
//     → for workspace scope, the token is emailed to the workspace
//       admin (not returned in the response) for chain-of-custody.
//
//   POST /api/admin/erasure/execute   { scope, target?, confirmation_token }
//     → runs the erasure, returns the certificate
//
// User-scope erasure is one-step (the user authenticated, that's
// supervision enough). Workspace-scope erasure requires the token
// step to prevent accidental destruction.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canApprove, type Role } from "@/lib/auth/rbac";
import { randomBytes } from "node:crypto";

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
  };
  if (body.scope !== "user" && body.scope !== "workspace") {
    return jsonError(400, "scope must be user|workspace");
  }
  // Workspace-scope requires admin or superadmin.
  if (body.scope === "workspace" && !isSuper && !canApprove(role)) {
    return jsonError(403, "admin_or_supervisor_only_for_workspace_erasure");
  }

  const token = randomBytes(24).toString("hex");
  const targetUserId = body.scope === "user" ? body.target_user_id ?? user.id : null;

  await supabaseAdmin.from("erasure_requests").insert({
    workspace_id: profile.workspace_id,
    initiated_by: user.id,
    target_user_id: targetUserId,
    scope: body.scope,
    confirmation_token: token,
    status: "pending",
  });

  // For user-scope, return the token directly (the user can confirm
  // immediately). For workspace-scope, return only that a token was
  // issued; the email integration delivers it to the admin.
  if (body.scope === "user") {
    return NextResponse.json({ confirmation_token: token, scope: "user" });
  }
  return NextResponse.json({
    scope: "workspace",
    notice: "A confirmation token has been issued. Check your admin email to retrieve it; you'll need it to execute the workspace erasure.",
  });
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

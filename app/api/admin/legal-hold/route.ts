// app/api/admin/legal-hold/route.ts
//
// Phase 7 W7.8 — e-discovery legal hold. Admin sets a flag that
// excludes the workspace from the retention worker indefinitely.
//
//   POST /api/admin/legal-hold   { set: true|false, note?: string }
//
// Action is fully audit-logged. Admin or superadmin only. Once
// set, retention worker reads workspaces.legal_hold and skips.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canApprove, type Role } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

interface Body {
  set?: boolean;
  note?: string;
}

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
  if (!isSuper && !canApprove(role)) return jsonError(403, "admin_only");

  const body = (await req.json().catch(() => ({}))) as Body;
  if (typeof body.set !== "boolean") return jsonError(400, "set:boolean required");

  const note = (body.note || "").trim().slice(0, 500) || null;
  const nowIso = new Date().toISOString();

  await supabaseAdmin
    .from("workspaces")
    .update({
      legal_hold: body.set,
      legal_hold_note: body.set ? note : null,
      legal_hold_set_at: body.set ? nowIso : null,
      legal_hold_set_by: body.set ? user.id : null,
    })
    .eq("id", profile.workspace_id);

  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: profile.workspace_id,
    user_id: user.id,
    action: body.set ? "legal_hold.set" : "legal_hold.cleared",
    resource_type: "workspace",
    resource_id: profile.workspace_id,
    metadata: { note, applied_at: nowIso },
    timestamp: nowIso,
  });

  return NextResponse.json({ ok: true, legal_hold: body.set });
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

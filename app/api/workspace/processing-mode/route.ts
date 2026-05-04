// app/api/workspace/processing-mode/route.ts
//
// Set the workspace-level default processing mode. Admin-only —
// this is a CCO-grade decision that flips the firm's default
// posture between cloud and local-only. Per-contact / per-doc /
// per-chat overrides remain available for both directions.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sb = await createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: profile } = await sb
    .from("profiles")
    .select("workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  const p = profile as { workspace_id?: string | null; role?: string } | null;
  if (!p?.workspace_id) {
    return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  }
  if (p.role !== "admin" && p.role !== "owner") {
    return NextResponse.json(
      { error: "admin or owner role required to change workspace default" },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    default_processing_mode?: "cloud" | "local_only";
  };
  if (
    body.default_processing_mode !== "cloud" &&
    body.default_processing_mode !== "local_only"
  ) {
    return NextResponse.json(
      { error: "default_processing_mode must be 'cloud' or 'local_only'" },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin
    .from("workspaces")
    .update({ default_processing_mode: body.default_processing_mode })
    .eq("id", p.workspace_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit log — this is one of the more material policy decisions
  // a CCO can make and should be visible at exam time.
  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: p.workspace_id,
    user_id: user.id,
    action: "workspace.default_processing_mode_changed",
    metadata: { new_value: body.default_processing_mode },
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    default_processing_mode: body.default_processing_mode,
  });
}

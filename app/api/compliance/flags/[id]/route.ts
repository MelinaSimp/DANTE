// PATCH /api/compliance/flags/[id]
//
// Body: { action: 'approved' | 'dismissed', note?: string }
//
// Transitions a compliance flag from 'pending' into its terminal
// state. Dismissals are sticky — see lib/compliance/scan.ts consumers
// (call-process auto-scan, the /api/compliance/scan endpoint) which
// filter out rule_ids already dismissed for the same (source_type,
// source_id). Approved flags stay visible as "reviewed" so the audit
// trail is intact.
//
// Only users within the flag's workspace can transition it; RLS on
// compliance_flags enforces that via the select.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  const note = typeof body?.note === "string" ? body.note.trim() : null;
  if (action !== "approved" && action !== "dismissed") {
    return NextResponse.json(
      { error: "action must be 'approved' or 'dismissed'" },
      { status: 400 }
    );
  }

  // Workspace check via RLS-backed select — if the user isn't in the
  // workspace that owns this flag, the select comes back empty.
  const { data: existing, error: selErr } = await supabase
    .from("compliance_flags")
    .select("id, workspace_id, status")
    .eq("id", id)
    .maybeSingle();
  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json(
      { error: "Flag not found or access denied" },
      { status: 404 }
    );
  }

  const { error: updErr } = await supabaseAdmin
    .from("compliance_flags")
    .update({
      status: action,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      reviewed_note: note,
    })
    .eq("id", id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await logAuditEvent({
    workspaceId: existing.workspace_id,
    actorUserId: user.id,
    actorKind: "user",
    action: "compliance_flag.review",
    entityType: "compliance_flag",
    entityId: id,
    metadata: {
      resolution: action,
      note,
    },
    request: req,
  });

  return NextResponse.json({ ok: true });
}

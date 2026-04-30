// PATCH /api/compliance/v2/[table]/[id]   { ...updateFields }
// DELETE /api/compliance/v2/[table]/[id]
//
// Generic update + delete for the Phase 3 compliance v2 tables.
// Field whitelisting depends on whether the caller is acting as a
// reviewer (CCO / workspace admin) or a self-submitter — see
// V2_TABLES[key].selfUpdateFields vs reviewUpdateFields.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";
import { isWorkspaceAdmin } from "@/lib/rbac";
import {
  V2_TABLES,
  pickFields,
  type V2TableKey,
} from "@/lib/compliance/v2-tables";

export const dynamic = "force-dynamic";

async function getCtx() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return null;
  return { user, workspaceId: profile.workspace_id as string, role: profile.role };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  const { table: tableKey, id } = await params;
  const config = V2_TABLES[tableKey as V2TableKey];
  if (!config) return NextResponse.json({ error: "Unknown table" }, { status: 404 });

  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const isAdmin = isWorkspaceAdmin(ctx.role);
  const allowed = isAdmin
    ? [...config.selfUpdateFields, ...config.reviewUpdateFields]
    : config.selfUpdateFields;

  const updates = pickFields(body, allowed);
  // Stamp reviewer info when a status changes to a review state.
  if (
    isAdmin &&
    typeof updates.status === "string" &&
    ["approved", "rejected", "changes_requested", "filed"].includes(
      updates.status as string,
    )
  ) {
    updates.reviewed_by = ctx.user.id;
    updates.reviewed_at = new Date().toISOString();
  }
  if (
    isAdmin &&
    typeof updates.disclosure_status === "string" &&
    config.table === "compliance_oba_records" &&
    updates.disclosure_status === "active"
  ) {
    updates.approved_by = ctx.user.id;
    updates.approved_at = new Date().toISOString();
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No writable fields in body" }, { status: 400 });
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from(config.table)
    .update(updates)
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAuditEvent({
    action: `${config.auditPrefix}.update`,
    actorUserId: ctx.user.id,
    workspaceId: ctx.workspaceId,
    entityType: config.table,
    entityId: id,
    metadata: updates,
    request: req,
  }).catch(() => {});

  return NextResponse.json({ row: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  const { table: tableKey, id } = await params;
  const config = V2_TABLES[tableKey as V2TableKey];
  if (!config) return NextResponse.json({ error: "Unknown table" }, { status: 404 });

  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabaseAdmin
    .from(config.table)
    .delete()
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAuditEvent({
    action: `${config.auditPrefix}.delete`,
    actorUserId: ctx.user.id,
    workspaceId: ctx.workspaceId,
    entityType: config.table,
    entityId: id,
    request: req,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}

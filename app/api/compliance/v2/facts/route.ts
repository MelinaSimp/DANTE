// GET /api/compliance/v2/facts          — read this workspace's facts
// PATCH /api/compliance/v2/facts        — update facts (workspace admin only)
//
// One row per workspace in workspace_compliance_facts. The ADV
// drafter reads this row to ground generated sections; the CCO
// edits these once and reuses across drafts.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isWorkspaceAdmin } from "@/lib/rbac";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

const WRITABLE_FIELDS = [
  "firm_legal_name",
  "firm_dba",
  "firm_address",
  "firm_phone",
  "firm_website",
  "firm_iard_crd",
  "aum_regulatory",
  "aum_discretionary",
  "aum_non_discretionary",
  "aum_as_of",
  "client_count",
  "principal_owners",
  "cco_name",
  "services_offered",
  "primary_custodians",
  "fee_schedule_summary",
  "account_minimum_usd",
  "has_material_disciplinary_events",
  "disciplinary_summary",
  "is_sec_registered",
  "state_registrations",
  "has_performance_fees",
  "has_custody",
  "custody_basis",
  "votes_proxies",
  "notes",
] as const;

async function getCtx() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return null;
  return { user, workspaceId: profile.workspace_id as string, role: profile.role };
}

export async function GET() {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("workspace_compliance_facts")
    .select("*")
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ facts: data || null });
}

export async function PATCH(req: NextRequest) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isWorkspaceAdmin(ctx.role)) {
    return NextResponse.json(
      { error: "Workspace admin role required" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  for (const k of WRITABLE_FIELDS) {
    if (k in body) updates[k] = (body as any)[k];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No writable fields" }, { status: 400 });
  }
  updates.updated_at = new Date().toISOString();
  updates.updated_by = ctx.user.id;

  const { data, error } = await supabaseAdmin
    .from("workspace_compliance_facts")
    .upsert(
      { workspace_id: ctx.workspaceId, ...updates },
      { onConflict: "workspace_id" }
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAuditEvent({
    action: "compliance.facts.update",
    actorUserId: ctx.user.id,
    workspaceId: ctx.workspaceId,
    entityType: "workspace_compliance_facts",
    entityId: ctx.workspaceId,
    metadata: { fields_changed: Object.keys(updates) },
    request: req,
  }).catch(() => {});

  return NextResponse.json({ facts: data });
}

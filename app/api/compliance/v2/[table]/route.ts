// GET /api/compliance/v2/[table]?status=pending
// POST /api/compliance/v2/[table]   { ...createFields }
//
// Generic list + create across the four Phase 3 compliance v2
// tables (marketing reviews, ADV drafts, OBA records, advertising
// reviews). Whitelisted via lib/compliance/v2-tables.ts.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ table: string }> }
) {
  const { table: tableKey } = await params;
  const config = V2_TABLES[tableKey as V2TableKey];
  if (!config) return NextResponse.json({ error: "Unknown table" }, { status: 404 });

  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 500);

  let q = supabaseAdmin
    .from(config.table)
    .select("*")
    .eq("workspace_id", ctx.workspaceId)
    .order(config.defaultOrderColumn, { ascending: config.defaultOrderAsc })
    .limit(limit);

  if (status) {
    // Match the right column — most use 'status', OBA uses 'disclosure_status'.
    if (config.table === "compliance_oba_records") {
      q = q.eq("disclosure_status", status);
    } else {
      q = q.eq("status", status);
    }
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data || [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ table: string }> }
) {
  const { table: tableKey } = await params;
  const config = V2_TABLES[tableKey as V2TableKey];
  if (!config) return NextResponse.json({ error: "Unknown table" }, { status: 404 });

  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const insertFields = pickFields(body, config.createFields);

  // Add system fields
  const insertRow: Record<string, unknown> = {
    ...insertFields,
    workspace_id: ctx.workspaceId,
  };
  // Best-effort: stamp submitted_by / created_by / advisor_id when the
  // table has it.
  if (config.table === "compliance_marketing_reviews" || config.table === "compliance_advertising_reviews") {
    insertRow.submitted_by = ctx.user.id;
  }
  if (config.table === "compliance_adv_drafts") {
    insertRow.created_by = ctx.user.id;
  }
  if (config.table === "compliance_oba_records" && !insertRow.advisor_id) {
    insertRow.advisor_id = ctx.user.id;
  }

  const { data, error } = await supabaseAdmin
    .from(config.table)
    .insert(insertRow)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAuditEvent({
    action: `${config.auditPrefix}.create`,
    actorUserId: ctx.user.id,
    workspaceId: ctx.workspaceId,
    entityType: config.table,
    entityId: (data as any)?.id,
    metadata: insertFields,
    request: req,
  }).catch(() => {});

  return NextResponse.json({ row: data });
}

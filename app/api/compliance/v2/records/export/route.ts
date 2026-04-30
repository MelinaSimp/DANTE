// GET /api/compliance/v2/records/export?from=...&to=...&type=audit|marketing|advertising|adv|oba|all
//
// Books-and-records export per SEC Rule 204-2 (Investment Advisers
// Act) and 17 CFR § 275.204-2. Returns a CSV bundle of every
// retained record category over the date range. CCO downloads this
// for examiner-on-site requests, annual review, or year-end records
// retention rotation.
//
// Records types covered:
//   - audit         → audit_events (every meaningful action in app)
//   - marketing     → compliance_marketing_reviews + scan results
//   - advertising   → compliance_advertising_reviews
//   - adv           → compliance_adv_drafts (filed snapshots)
//   - oba           → compliance_oba_records
//
// SEC's 5-year retention is the floor; 17a-4 (broker-dealer)
// requires 6-year WORM retention for some categories. This export
// is the practical answer to "produce the records since 2026-01-01"
// in 30 seconds rather than 30 hours.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isWorkspaceAdmin } from "@/lib/rbac";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type ExportType = "audit" | "marketing" | "advertising" | "adv" | "oba" | "all";

const VALID_TYPES: ExportType[] = ["audit", "marketing", "advertising", "adv", "oba", "all"];

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return csvEscape(JSON.stringify(v));
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: any[], columns: string[]): string {
  const out: string[] = [columns.join(",")];
  for (const r of rows) {
    out.push(columns.map((c) => csvEscape(r[c])).join(","));
  }
  return out.join("\n");
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  if (!isWorkspaceAdmin(profile.role)) {
    return NextResponse.json(
      { error: "Workspace admin role required" },
      { status: 403 }
    );
  }
  const workspaceId = profile.workspace_id as string;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to") || new Date().toISOString();
  const type = (url.searchParams.get("type") || "all") as ExportType;
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  if (!from) {
    return NextResponse.json(
      { error: "?from=YYYY-MM-DD required" },
      { status: 400 }
    );
  }

  const fromIso = new Date(from).toISOString();
  const toIso = new Date(to).toISOString();

  const sections: string[] = [];

  if (type === "all" || type === "audit") {
    const { data, error } = await supabaseAdmin
      .from("audit_events")
      .select(
        "created_at, actor_kind, actor_user_id, actor_label, action, entity_type, entity_id, ip_address, user_agent, metadata"
      )
      .eq("workspace_id", workspaceId)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: true })
      .limit(100_000);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    sections.push(
      "# AUDIT EVENTS\n" +
        rowsToCsv(data || [], [
          "created_at",
          "actor_kind",
          "actor_user_id",
          "actor_label",
          "action",
          "entity_type",
          "entity_id",
          "ip_address",
          "user_agent",
          "metadata",
        ])
    );
  }

  if (type === "all" || type === "marketing") {
    const { data } = await supabaseAdmin
      .from("compliance_marketing_reviews")
      .select(
        "id, created_at, channel, title, intended_audience, intended_send_at, scan_severity, status, reviewed_by, reviewed_at, approved_for_use_until, body, scan_result, review_note"
      )
      .eq("workspace_id", workspaceId)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: true });
    sections.push(
      "# MARKETING REVIEWS\n" +
        rowsToCsv(data || [], [
          "id",
          "created_at",
          "channel",
          "title",
          "intended_audience",
          "intended_send_at",
          "scan_severity",
          "status",
          "reviewed_by",
          "reviewed_at",
          "approved_for_use_until",
          "review_note",
          "body",
          "scan_result",
        ])
    );
  }

  if (type === "all" || type === "advertising") {
    const { data } = await supabaseAdmin
      .from("compliance_advertising_reviews")
      .select(
        "id, created_at, ad_type, source, content, is_compensated, compensation_amount, has_disclosure, disclosure_text, status, reviewed_by, reviewed_at, approved_for_use_until, retention_until, review_note"
      )
      .eq("workspace_id", workspaceId)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: true });
    sections.push(
      "# ADVERTISING REVIEWS\n" +
        rowsToCsv(data || [], [
          "id",
          "created_at",
          "ad_type",
          "source",
          "content",
          "is_compensated",
          "compensation_amount",
          "has_disclosure",
          "disclosure_text",
          "status",
          "reviewed_by",
          "reviewed_at",
          "approved_for_use_until",
          "retention_until",
          "review_note",
        ])
    );
  }

  if (type === "all" || type === "adv") {
    const { data } = await supabaseAdmin
      .from("compliance_adv_drafts")
      .select(
        "id, created_at, updated_at, title, effective_date, status, filed_at, filed_by, sections, notes"
      )
      .eq("workspace_id", workspaceId)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: true });
    sections.push(
      "# ADV DRAFTS\n" +
        rowsToCsv(data || [], [
          "id",
          "created_at",
          "updated_at",
          "title",
          "effective_date",
          "status",
          "filed_at",
          "filed_by",
          "notes",
          "sections",
        ])
    );
  }

  if (type === "all" || type === "oba") {
    const { data } = await supabaseAdmin
      .from("compliance_oba_records")
      .select(
        "id, created_at, updated_at, advisor_id, advisor_name, activity_name, activity_type, description, is_compensated, estimated_hours_per_month, start_date, end_date, is_disclosed_to_clients, disclosure_status, last_attested_at, next_attestation_due, approved_by, approved_at, notes"
      )
      .eq("workspace_id", workspaceId)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: true });
    sections.push(
      "# OBA RECORDS\n" +
        rowsToCsv(data || [], [
          "id",
          "created_at",
          "updated_at",
          "advisor_id",
          "advisor_name",
          "activity_name",
          "activity_type",
          "description",
          "is_compensated",
          "estimated_hours_per_month",
          "start_date",
          "end_date",
          "is_disclosed_to_clients",
          "disclosure_status",
          "last_attested_at",
          "next_attestation_due",
          "approved_by",
          "approved_at",
          "notes",
        ])
    );
  }

  const csv = sections.join("\n\n");
  const filename = `compliance-records-${type}-${from}-to-${to.slice(0, 10)}.csv`;

  await logAuditEvent({
    action: "compliance.records.export",
    actorUserId: user.id,
    workspaceId,
    entityType: "workspace",
    entityId: workspaceId,
    metadata: { type, from, to, byteSize: csv.length },
    request: req,
  }).catch(() => {});

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

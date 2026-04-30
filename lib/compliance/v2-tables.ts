// Phase 3 Compliance v2 — table whitelist + write fields per surface.
//
// All four CCO surfaces (marketing, ADV, OBA, advertising) share
// nearly identical CRUD shapes: list, create, update status, delete.
// Rather than write four near-identical route files, we whitelist
// the tables and writable fields here, then the generic route
// handlers in /api/compliance/v2/[table] dispatch through this map.
//
// This keeps the routes thin (~50 lines total) and makes adding a
// fifth or sixth surface a one-line config change.

export type V2TableKey =
  | "marketing"
  | "adv"
  | "oba"
  | "advertising";

export interface V2TableConfig {
  table: string;
  // Fields the client may set on create. Anything not in this list
  // is ignored, including system fields (workspace_id, created_at,
  // dismissed_at — those are server-set or read-only).
  createFields: string[];
  // Fields a non-CCO advisor may update (their own submission).
  selfUpdateFields: string[];
  // Fields a CCO may update (review actions). Superset of self-update.
  reviewUpdateFields: string[];
  // List query default order
  defaultOrderColumn: string;
  defaultOrderAsc: boolean;
  // Audit-action prefix written to audit_events when CRUD happens.
  auditPrefix: string;
}

export const V2_TABLES: Record<V2TableKey, V2TableConfig> = {
  marketing: {
    table: "compliance_marketing_reviews",
    createFields: [
      "channel",
      "title",
      "body",
      "intended_audience",
      "intended_send_at",
    ],
    selfUpdateFields: [
      "channel",
      "title",
      "body",
      "intended_audience",
      "intended_send_at",
    ],
    reviewUpdateFields: [
      "status",
      "review_note",
      "approved_for_use_until",
      "scan_result",
      "scan_severity",
    ],
    defaultOrderColumn: "created_at",
    defaultOrderAsc: false,
    auditPrefix: "compliance.marketing",
  },
  adv: {
    table: "compliance_adv_drafts",
    createFields: ["title", "effective_date", "sections", "notes"],
    selfUpdateFields: ["title", "effective_date", "sections", "notes"],
    reviewUpdateFields: [
      "status",
      "filed_at",
      "filed_by",
      "title",
      "effective_date",
      "sections",
      "notes",
    ],
    defaultOrderColumn: "updated_at",
    defaultOrderAsc: false,
    auditPrefix: "compliance.adv",
  },
  oba: {
    table: "compliance_oba_records",
    createFields: [
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
      "next_attestation_due",
      "notes",
    ],
    selfUpdateFields: [
      "activity_name",
      "activity_type",
      "description",
      "is_compensated",
      "estimated_hours_per_month",
      "start_date",
      "end_date",
      "is_disclosed_to_clients",
      "notes",
    ],
    reviewUpdateFields: [
      "disclosure_status",
      "approved_by",
      "approved_at",
      "last_attested_at",
      "next_attestation_due",
      "notes",
    ],
    defaultOrderColumn: "next_attestation_due",
    defaultOrderAsc: true,
    auditPrefix: "compliance.oba",
  },
  advertising: {
    table: "compliance_advertising_reviews",
    createFields: [
      "ad_type",
      "source",
      "content",
      "is_compensated",
      "compensation_amount",
      "has_disclosure",
      "disclosure_text",
    ],
    selfUpdateFields: [
      "ad_type",
      "source",
      "content",
      "is_compensated",
      "compensation_amount",
      "has_disclosure",
      "disclosure_text",
    ],
    reviewUpdateFields: [
      "status",
      "review_note",
      "approved_for_use_until",
      "retention_until",
    ],
    defaultOrderColumn: "created_at",
    defaultOrderAsc: false,
    auditPrefix: "compliance.advertising",
  },
};

export function pickFields(
  body: Record<string, unknown>,
  allowed: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) out[k] = body[k];
  }
  return out;
}

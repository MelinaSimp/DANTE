// lib/industry/vertical-spec.ts
//
// CRE-only structured specifications.
//
// lib/industry/config.ts owns the user-facing copy (eyebrow, hero,
// starter questions). This file owns the structured behavior — the
// pieces the agent loop, retention worker, compliance scanner, and
// memory taxonomy actually read at runtime.
//
// RIA vertical removed 2026-05-24.

import type { Industry } from "./config";

// ── Memory taxonomy ──────────────────────────────────────────────

export const REALTOR_MEMORY_CATEGORIES = [
  "preference",
  "dealbreaker",
  "financing_status",
  "timeline",
  "objection_handled",
  "tour_feedback",
  "neighborhood_interest",
  "realtor_preference",
] as const;
export type RealtorMemoryCategory = (typeof REALTOR_MEMORY_CATEGORIES)[number];

// ── Tool whitelists ──────────────────────────────────────────────
//
// The chat surface uses a read-mostly set; these are vertical-
// agnostic and shared. Each vertical also exposes domain-specific
// tools via skill.run / MCP — listed here so the agent loop can
// surface them in a vertical-aware way as those tools land.

export interface ToolWhitelist {
  /** Always-available, in every workspace of this industry. */
  builtin: string[];
  /** Vertical-specific named skills the chat surface promotes. */
  promoted_skills: string[];
}

// ── Compliance flag taxonomies ───────────────────────────────────
//
// Open list — the compliance scanner registers flag handlers per
// vertical. The strings here are the canonical taxonomy a workspace
// admin sees in the queue UI.

export interface ComplianceFlagSpec {
  code: string;              // canonical id, e.g. "ria.unsupervised_communication"
  label: string;             // human label
  severity: "low" | "medium" | "high";
  description: string;
}

// ── Retention defaults ───────────────────────────────────────────

export interface RetentionDefaults {
  contacts_retention_days: number;
  documents_retention_days: number;
  memories_retention_days: number;
  conversations_retention_days: number;
  /** Plain-English rationale shown in workspace settings. */
  rationale: string;
}

// ── Whole vertical spec ──────────────────────────────────────────

export interface VerticalSpec {
  industry: Industry;
  toolWhitelist: ToolWhitelist;
  memoryCategories: readonly string[];
  complianceFlags: ComplianceFlagSpec[];
  retentionDefaults: RetentionDefaults;
  /** Default reviewer role for the supervisor review queue. */
  defaultReviewerRole: "principal" | "designated_broker";
  /** Vault document kinds that qualify as transaction-file artifacts
   *  — compliance exports include these by default. */
  transactionFileDocKinds: string[];
}

const REALTOR_SPEC: VerticalSpec = {
  industry: "real_estate",
  toolWhitelist: {
    builtin: [
      "memory.search",
      "archive.search",
      "vault.cite",
      "clients.query",
      "skill.run",
      "reminder.schedule",
      "workflow.propose",
      "workflow.run",
      "workflow.list",
      "workflow.update",
      "file_index.search",
      "file_index.ingest",
      "file_index.list_folder",
      "site_scan.search",
      "site_scan.detail",
      "site_scan.listings",
      "site_scan.void_analysis",
      "survey_area",
      "regulatory.search",
      "inconsistency.detect",
      "cre.calculate",
    ],
    promoted_skills: [
      "draft_listing_prep_recap",
      "summarize_recent_buyer_emails",
      "prep_briefing_for_showing",
      // Phase 3 W3.5 expansion targets:
      // "tour_followup_draft",
      // "fair_housing_scan",
      // "comp_lookup",
      // "price_reduction_recommendation",
    ],
  },
  memoryCategories: REALTOR_MEMORY_CATEGORIES,
  complianceFlags: [
    {
      code: "re.fair_housing_risk",
      label: "Fair housing language risk",
      severity: "high",
      description:
        "Drafted text contains potentially discriminatory or steering language (e.g., 'perfect for families', 'safe neighborhood').",
    },
    {
      code: "re.missing_required_disclosure",
      label: "Missing required disclosure",
      severity: "high",
      description:
        "Listing or transaction file is missing a state-required disclosure (lead paint, agency, dual agency, property condition).",
    },
    {
      code: "re.commission_uncited",
      label: "Commission language without broker review",
      severity: "medium",
      description:
        "Commission terms drafted without a review trail by the designated broker.",
    },
    {
      code: "re.dual_agency_consent_missing",
      label: "Dual agency consent missing",
      severity: "high",
      description:
        "Dual representation indicated without explicit informed consent from both parties.",
    },
  ],
  retentionDefaults: {
    contacts_retention_days: 2555,        // 7 years (covers most state minimums)
    documents_retention_days: 2555,
    memories_retention_days: 2555,
    conversations_retention_days: 2555,
    rationale:
      "State real estate commission rules vary (3–7 years post-close). Default 7 years for headroom across CA, FL, NY, TX, IL.",
  },
  defaultReviewerRole: "designated_broker",
  transactionFileDocKinds: [
    "client_agreement",      // listing agreements + buyer-broker agreements
    "policy",                // brokerage policy + disclosures
    "memo",                  // tour notes + recap memos
  ],
};

export function getVerticalSpec(_industry?: Industry): VerticalSpec {
  return REALTOR_SPEC;
}

export function getVerticalSpecLoose(
  _industry?: string | null | undefined,
): VerticalSpec {
  return REALTOR_SPEC;
}

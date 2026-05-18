// lib/industry/vertical-spec.ts
//
// Phase 3 W3.5 — structured per-vertical specifications.
//
// lib/industry/config.ts owns the user-facing copy (eyebrow, hero,
// starter questions). This file owns the structured behavior — the
// pieces the agent loop, retention worker, compliance scanner, and
// memory taxonomy actually read at runtime.
//
// Why split? config.ts is small enough to scan as a copy file. As
// per-vertical behavior accretes (tool whitelists, memory
// categories, retention defaults, compliance flag taxonomies), it
// would crowd that file out. Keeping behavior in this companion
// keeps both readable.
//
// Both verticals are populated at parity. Adding a new field is a
// dual-vertical change by construction — a TS error if either side
// is missing.

import type { Industry } from "./config";

// ── Memory taxonomy ──────────────────────────────────────────────
//
// Vertical-specific categories that ride on top of the generic
// `dante_memory.kind` (fact / summary / episode). We persist the
// category in `dante_memory.metadata.category` (jsonb) so the
// scorecard can query "how many financial_planning facts in this
// workspace" without a schema change.

export const ADVISOR_MEMORY_CATEGORIES = [
  "risk_profile",
  "life_event",
  "goal_change",
  "compliance_note",
  "family_context",
  "tax_situation",
  "estate_plan",
  "advisor_preference",      // "prefers Tuesday morning calls"
] as const;
export type AdvisorMemoryCategory = (typeof ADVISOR_MEMORY_CATEGORIES)[number];

export const REALTOR_MEMORY_CATEGORIES = [
  "preference",              // "wants finished basement"
  "dealbreaker",             // "no flood zones"
  "financing_status",
  "timeline",
  "objection_handled",
  "tour_feedback",
  "neighborhood_interest",
  "realtor_preference",      // "prefers text over email"
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

const ADVISOR_SPEC: VerticalSpec = {
  industry: "financial_advisor",
  toolWhitelist: {
    builtin: [
      "memory.search",
      "archive.search",
      "vault.cite",
      "clients.query",
      "skill.run",
      "reminder.schedule",
      "workflow.propose",
      "file_index.search",
      "file_index.ingest",
      "site_scan.search",
      "site_scan.detail",
      "site_scan.listings",
    ],
    promoted_skills: [
      "draft_review_meeting_recap",
      "summarize_recent_emails",
      "prep_briefing_for_meeting",
      // Phase 3 W3.5 expansion targets — registered here as the
      // canonical names; skill rows are seeded as workspaces opt in:
      // "rmd_reminder_check",
      // "tax_loss_harvest_scan",
      // "ips_drift_check",
      // "compliance_letter_draft",
    ],
  },
  memoryCategories: ADVISOR_MEMORY_CATEGORIES,
  complianceFlags: [
    {
      code: "ria.unsupervised_communication",
      label: "Unsupervised client communication",
      severity: "high",
      description:
        "Client-facing message sent without principal review. FINRA 3110 / SEC 206(4)-7 implicate.",
    },
    {
      code: "ria.performance_representation_uncited",
      label: "Performance claim without source",
      severity: "high",
      description:
        "A representation about returns or performance was made without a citation to a source document.",
    },
    {
      code: "ria.missing_disclosure",
      label: "Missing disclosure",
      severity: "medium",
      description:
        "Material conflict / fee / risk not disclosed where context requires it.",
    },
    {
      code: "ria.ips_deviation",
      label: "IPS deviation",
      severity: "medium",
      description:
        "Recommendation drifts from the client's Investment Policy Statement without addendum.",
    },
  ],
  retentionDefaults: {
    contacts_retention_days: 2555,        // 7 years
    documents_retention_days: 2555,       // 7 years
    memories_retention_days: 2555,
    conversations_retention_days: 2555,
    rationale:
      "SEC Rule 17a-4 + FINRA Rule 4511 require ≥5 years for communications and books-and-records. Default 7 years for headroom.",
  },
  defaultReviewerRole: "principal",
  transactionFileDocKinds: ["form_adv", "ips", "client_agreement"],
};

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
      "file_index.search",
      "file_index.ingest",
      "site_scan.search",
      "site_scan.detail",
      "site_scan.listings",
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

const SPECS: Record<Industry, VerticalSpec> = {
  financial_advisor: ADVISOR_SPEC,
  real_estate: REALTOR_SPEC,
};

export function getVerticalSpec(industry: Industry): VerticalSpec {
  return SPECS[industry];
}

/** Resolve from a free-form string with the same fallback policy as
 *  getIndustryConfig. */
export function getVerticalSpecLoose(
  industry: string | null | undefined,
): VerticalSpec {
  if (industry === "real_estate") return SPECS.real_estate;
  return SPECS.financial_advisor;
}

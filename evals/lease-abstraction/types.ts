// evals/lease-abstraction/types.ts
//
// Type definitions for the lease abstraction accuracy benchmark.
// Mirrors the shape of the main evals/types.ts but is specific to
// the field-by-field accuracy measurement that matters for CRE
// lease abstractions.

// ── Field-level types ────────────────────────────────────────────

export type MatchMode =
  | "exact"
  | "contains"
  | "regex"
  | "numeric_within_pct"
  | "date_match";

export type FieldCategory =
  | "parties"
  | "premises"
  | "term"
  | "rent"
  | "escalations"
  | "cam"
  | "security"
  | "ti"
  | "use"
  | "insurance"
  | "default"
  | "options"
  | "other";

export interface LeaseField {
  /** Field key, e.g. "base_rent", "commencement_date", "tenant_name". */
  name: string;
  /** Category grouping, e.g. "rent", "term", "parties". */
  category: FieldCategory;
  /** The ground-truth value we expect the abstract to contain. */
  expected_value: string;
  /** How to compare the extracted value against expected_value. */
  match_mode: MatchMode;
  /** For numeric_within_pct: maximum acceptable % deviation. */
  tolerance_pct?: number;
}

// ── Eval case ────────────────────────────────────────────────────

export type LeaseType =
  | "nnn"
  | "gross"
  | "modified_gross"
  | "ground"
  | "sublease";

export interface LeaseEvalCase {
  /** Stable identifier, e.g. "nnn-retail-10yr-001". */
  id: string;
  /** One-sentence description, e.g. "Standard NNN retail lease, 10yr term". */
  description: string;
  /** Lease structure type. */
  lease_type: LeaseType;
  /** Vault document title to search for (matches the abstract_lease skill input). */
  document_name: string;
  /** Ground-truth fields the abstract must extract. */
  expected_fields: LeaseField[];
}

// ── Results ──────────────────────────────────────────────────────

export interface FieldResult {
  field_name: string;
  category: FieldCategory;
  expected: string;
  actual: string | null;
  /** Was the extracted value accompanied by a [vN] citation marker? */
  cited: boolean;
  /** Did the extracted value match the expected value per match_mode? */
  match: boolean;
  match_mode: MatchMode;
  notes?: string;
}

export interface LeaseEvalResult {
  case_id: string;
  duration_ms: number;
  field_results: FieldResult[];
  total_fields: number;
  matched: number;
  /** Fields that were expected but not found in the abstract. */
  missed: number;
  /** Fields found but without a [vN] citation marker. */
  uncited: number;
  precision: number;
  recall: number;
  f1: number;
  /** Fraction of extracted (non-null) fields that carried a citation. */
  citation_rate: number;
}

export interface CategoryMetrics {
  precision: number;
  recall: number;
  f1: number;
}

export interface LeaseEvalSummary {
  timestamp: string;
  cases_run: number;
  aggregate_precision: number;
  aggregate_recall: number;
  aggregate_f1: number;
  aggregate_citation_rate: number;
  per_category: Record<string, CategoryMetrics>;
  results: LeaseEvalResult[];
}

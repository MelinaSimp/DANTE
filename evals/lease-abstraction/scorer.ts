// evals/lease-abstraction/scorer.ts
//
// Field-by-field scorer for lease abstraction evals.
//
// Takes the raw markdown abstract output from Vergil's abstract_lease
// skill and the expected fields from a LeaseEvalCase, then produces
// per-field match results and aggregate accuracy metrics.
//
// Designed to work standalone without API calls so it can score cached
// outputs. The runner calls this; it can also be imported directly for
// one-off scoring in a REPL.

import type {
  FieldResult,
  LeaseField,
  LeaseEvalResult,
  FieldCategory,
} from "./types";

// ── Citation detection ───────────────────────────────────────────

/**
 * Matches vault citation markers like [v1], [v2], [v12].
 * The abstract_lease skill uses vault.cite which emits these.
 */
const CITATION_RE = /\[v\d+\]/g;

/**
 * Check whether a citation marker appears near a value in the text.
 * "Near" means within the same markdown line or bullet, or within
 * the next 120 characters after the value appears.
 */
function hasCitationNear(text: string, value: string, position: number): boolean {
  // Look from 20 chars before the value start to 120 chars after value end.
  const searchStart = Math.max(0, position - 20);
  const searchEnd = Math.min(text.length, position + value.length + 120);
  const window = text.slice(searchStart, searchEnd);
  return CITATION_RE.test(window);
}

// ── Value extraction from markdown ───────────────────────────────

/**
 * Normalize a string for comparison: collapse whitespace, trim, lowercase.
 */
function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Try to find the value for a named field in the abstract markdown.
 *
 * Strategy:
 * 1. Look for a line containing the field name (or a known alias) as
 *    a label, then extract the value portion after the colon / pipe.
 * 2. If the field name is found as a markdown header, scan the lines
 *    below it for the value.
 *
 * Returns { value, position } or null if not found.
 */
function extractFieldValue(
  markdown: string,
  field: LeaseField,
): { value: string; position: number } | null {
  const lines = markdown.split("\n");
  const fieldAliases = buildFieldAliases(field.name);
  const normalizedMd = normalize(markdown);

  // Strategy 1: Line-level label matching.
  // Look for patterns like "**Base Rent:** $25.00/SF" or "| Base Rent | $25.00/SF |"
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const normalizedLine = normalize(line);

    for (const alias of fieldAliases) {
      const normalizedAlias = normalize(alias);
      if (!normalizedLine.includes(normalizedAlias)) continue;

      // Try colon-separated: "**Label:** value" or "Label: value"
      const colonPattern = new RegExp(
        alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[::]\\s*(.+)",
        "i",
      );
      const colonMatch = line.match(colonPattern);
      if (colonMatch) {
        const value = colonMatch[1]
          .replace(/\*\*/g, "")
          .replace(/\[v\d+\]/g, "")
          .trim();
        if (value) {
          const position = markdown.indexOf(line);
          return { value, position: position >= 0 ? position : 0 };
        }
      }

      // Try pipe-separated (markdown table): "| Label | value |"
      const pipeMatch = line.match(/\|[^|]*\|([^|]+)\|/);
      if (pipeMatch && normalizedLine.includes(normalizedAlias)) {
        const value = pipeMatch[1]
          .replace(/\*\*/g, "")
          .replace(/\[v\d+\]/g, "")
          .trim();
        if (value) {
          const position = markdown.indexOf(line);
          return { value, position: position >= 0 ? position : 0 };
        }
      }

      // Try: value appears on the next non-empty line after a header
      if (
        normalizedLine.includes(normalizedAlias) &&
        (line.trim().startsWith("#") || line.trim().startsWith("**"))
      ) {
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const nextLine = lines[j].trim();
          if (!nextLine) continue;
          const value = nextLine
            .replace(/^[-*]\s*/, "")
            .replace(/\*\*/g, "")
            .replace(/\[v\d+\]/g, "")
            .trim();
          if (value) {
            const position = markdown.indexOf(lines[j]);
            return { value, position: position >= 0 ? position : 0 };
          }
        }
      }
    }
  }

  // Strategy 2: Brute-force search for the expected value in the full text.
  // This handles cases where the field label doesn't match our aliases but
  // the value itself is present somewhere.
  const normalizedExpected = normalize(field.expected_value);
  const idx = normalizedMd.indexOf(normalizedExpected);
  if (idx >= 0) {
    // Walk back to find the raw substring in the original markdown
    const rawSlice = markdown.slice(
      Math.max(0, idx - 20),
      idx + field.expected_value.length + 20,
    );
    return { value: field.expected_value, position: idx };
  }

  return null;
}

/**
 * Build a list of label aliases for a field name.
 * "base_rent" -> ["base rent", "base_rent", "Base Rent"]
 * "commencement_date" -> ["commencement date", "commencement_date", "lease commencement"]
 */
function buildFieldAliases(fieldName: string): string[] {
  const base = fieldName.replace(/_/g, " ");
  const aliases = [base, fieldName];

  // Add common CRE synonyms
  const synonyms: Record<string, string[]> = {
    base_rent: ["base rent", "base rental rate", "annual rent", "monthly rent"],
    commencement_date: ["commencement date", "lease commencement", "start date"],
    expiration_date: ["expiration date", "lease expiration", "end date", "termination date"],
    tenant_name: ["tenant", "lessee"],
    landlord_name: ["landlord", "lessor", "owner"],
    security_deposit: ["security deposit", "deposit"],
    ti_allowance: ["tenant improvement", "ti allowance", "improvement allowance", "build-out allowance"],
    cam_charges: ["cam", "common area maintenance", "operating expenses", "cam charges"],
    permitted_use: ["permitted use", "use clause", "authorized use"],
    lease_term: ["lease term", "term of lease", "term"],
    premises: ["premises", "demised premises", "leased premises"],
    rentable_sf: ["rentable square feet", "rentable sf", "rsf", "square footage"],
    annual_escalation: ["escalation", "annual increase", "rent escalation", "annual escalation"],
    percentage_rent: ["percentage rent", "percent rent", "overage rent"],
    renewal_option: ["renewal option", "option to renew", "renewal"],
    expansion_option: ["expansion option", "option to expand", "right of first offer"],
    holdover_rate: ["holdover", "holdover rate", "holdover rent"],
    guarantor: ["guarantor", "personal guarantee", "guarantee"],
    parking: ["parking", "parking spaces", "parking ratio"],
  };

  const extra = synonyms[fieldName];
  if (extra) aliases.push(...extra);

  return [...new Set(aliases)];
}

// ── Match mode comparators ───────────────────────────────────────

function matchExact(expected: string, actual: string): boolean {
  return normalize(expected) === normalize(actual);
}

function matchContains(expected: string, actual: string): boolean {
  return normalize(actual).includes(normalize(expected));
}

function matchRegex(pattern: string, actual: string): boolean {
  try {
    const re = new RegExp(pattern, "i");
    return re.test(actual);
  } catch {
    return false;
  }
}

function matchNumericWithinPct(
  expected: string,
  actual: string,
  tolerancePct: number,
): boolean {
  const expNum = parseNumber(expected);
  const actNum = parseNumber(actual);
  if (expNum === null || actNum === null) return false;
  if (expNum === 0) return actNum === 0;
  const delta = Math.abs(expNum - actNum) / Math.abs(expNum);
  return delta <= tolerancePct / 100;
}

function matchDate(expected: string, actual: string): boolean {
  const expDate = parseDate(expected);
  const actDate = parseDate(actual);
  if (!expDate || !actDate) return false;
  // Same calendar day
  return (
    expDate.getFullYear() === actDate.getFullYear() &&
    expDate.getMonth() === actDate.getMonth() &&
    expDate.getDate() === actDate.getDate()
  );
}

/**
 * Parse a number from a string that may contain currency symbols,
 * commas, "per SF", etc.
 * "$25.00/SF" -> 25.00
 * "$1,500,000" -> 1500000
 * "12.5%" -> 12.5
 */
function parseNumber(s: string): number | null {
  // Strip everything that's not a digit, dot, or minus sign
  const cleaned = s.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/**
 * Parse a date from various CRE-common formats:
 *   "January 1, 2025" / "Jan 1, 2025"
 *   "1/1/2025" / "01/01/2025"
 *   "2025-01-01"
 */
function parseDate(s: string): Date | null {
  const trimmed = s.trim();

  // ISO: 2025-01-01
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const d = new Date(
      parseInt(isoMatch[1]),
      parseInt(isoMatch[2]) - 1,
      parseInt(isoMatch[3]),
    );
    return isNaN(d.getTime()) ? null : d;
  }

  // US slash: M/D/YYYY or MM/DD/YYYY
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const d = new Date(
      parseInt(usMatch[3]),
      parseInt(usMatch[1]) - 1,
      parseInt(usMatch[2]),
    );
    return isNaN(d.getTime()) ? null : d;
  }

  // Named month: "January 1, 2025" or "Jan 1, 2025" or "1 January 2025"
  const months: Record<string, number> = {
    january: 0, jan: 0,
    february: 1, feb: 1,
    march: 2, mar: 2,
    april: 3, apr: 3,
    may: 4,
    june: 5, jun: 5,
    july: 6, jul: 6,
    august: 7, aug: 7,
    september: 8, sep: 8, sept: 8,
    october: 9, oct: 9,
    november: 10, nov: 10,
    december: 11, dec: 11,
  };

  // "Month D, YYYY"
  const namedMatch = trimmed.match(
    /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/,
  );
  if (namedMatch) {
    const month = months[namedMatch[1].toLowerCase()];
    if (month !== undefined) {
      const d = new Date(parseInt(namedMatch[3]), month, parseInt(namedMatch[2]));
      return isNaN(d.getTime()) ? null : d;
    }
  }

  // "D Month YYYY"
  const euroMatch = trimmed.match(
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/,
  );
  if (euroMatch) {
    const month = months[euroMatch[2].toLowerCase()];
    if (month !== undefined) {
      const d = new Date(parseInt(euroMatch[3]), month, parseInt(euroMatch[1]));
      return isNaN(d.getTime()) ? null : d;
    }
  }

  // Last resort: try native Date.parse
  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? null : fallback;
}

// ── Main scorer ──────────────────────────────────────────────────

function applyMatch(field: LeaseField, actual: string): boolean {
  switch (field.match_mode) {
    case "exact":
      return matchExact(field.expected_value, actual);
    case "contains":
      return matchContains(field.expected_value, actual);
    case "regex":
      return matchRegex(field.expected_value, actual);
    case "numeric_within_pct":
      return matchNumericWithinPct(
        field.expected_value,
        actual,
        field.tolerance_pct ?? 5,
      );
    case "date_match":
      return matchDate(field.expected_value, actual);
  }
}

/**
 * Score a single lease abstract against expected fields.
 *
 * @param markdown - The raw markdown output from the abstract_lease skill.
 * @param expectedFields - Ground-truth fields from the eval case.
 * @param caseId - Identifier for logging.
 * @returns Per-field results and aggregate metrics.
 */
export function scoreAbstract(
  markdown: string,
  expectedFields: LeaseField[],
  caseId: string,
): LeaseEvalResult {
  const start = Date.now();
  const fieldResults: FieldResult[] = [];

  for (const field of expectedFields) {
    const extracted = extractFieldValue(markdown, field);

    if (!extracted) {
      fieldResults.push({
        field_name: field.name,
        category: field.category,
        expected: field.expected_value,
        actual: null,
        cited: false,
        match: false,
        match_mode: field.match_mode,
        notes: "Field not found in abstract output.",
      });
      continue;
    }

    const { value, position } = extracted;
    const cited = hasCitationNear(markdown, value, position);
    const match = applyMatch(field, value);

    fieldResults.push({
      field_name: field.name,
      category: field.category,
      expected: field.expected_value,
      actual: value,
      cited,
      match,
      match_mode: field.match_mode,
      notes: match ? undefined : `Extracted "${value}" did not match expected.`,
    });
  }

  const totalFields = fieldResults.length;
  const matched = fieldResults.filter((r) => r.match).length;
  const extracted = fieldResults.filter((r) => r.actual !== null);
  const missed = fieldResults.filter((r) => r.actual === null).length;
  const uncited = extracted.filter((r) => !r.cited).length;

  // Precision: of the fields we extracted, how many matched?
  const precision = extracted.length > 0 ? matched / extracted.length : 0;
  // Recall: of all expected fields, how many did we match?
  const recall = totalFields > 0 ? matched / totalFields : 0;
  const f1 =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;
  const citationRate =
    extracted.length > 0
      ? extracted.filter((r) => r.cited).length / extracted.length
      : 0;

  return {
    case_id: caseId,
    duration_ms: Date.now() - start,
    field_results: fieldResults,
    total_fields: totalFields,
    matched,
    missed,
    uncited,
    precision,
    recall,
    f1,
    citation_rate: citationRate,
  };
}

// ── Exported utilities (for tests and the runner) ────────────────

export {
  parseNumber,
  parseDate,
  matchExact,
  matchContains,
  matchRegex,
  matchNumericWithinPct,
  matchDate,
  extractFieldValue,
  hasCitationNear,
  buildFieldAliases,
};

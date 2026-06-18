// lib/dante/verify.ts
//
// The Verify/abstain contract. When a value can't be grounded in the
// source, the system must say so explicitly — return null and mark it
// "verify" — instead of guessing. This module gives that behavior a
// shared shape (types), a normalizer, a rollup, and a prompt fragment
// extractors can paste in. Pure and dependency-free so both server
// extractors and client UIs can import it.

export type VerifyStatus = "answered" | "verify";

/** A single extracted value with explicit provenance about whether it
 *  is trustworthy or needs a human to confirm it. */
export interface VerifyField<T = string> {
  value: T | null;
  status: VerifyStatus;
  /** Why it needs verification (missing in source, ambiguous, conflicting). */
  reason?: string | null;
  /** Source citation when answered (e.g. "[v12]"). */
  citation?: string | null;
}

/** True when a field is flagged for human verification. */
export function needsVerification(status: VerifyStatus): boolean {
  return status === "verify";
}

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  );
}

/**
 * Normalize an extracted value into a VerifyField. A null/empty value
 * becomes a "verify" state; anything present is "answered".
 */
export function toVerifyField<T>(
  value: T | null | undefined,
  opts: { reason?: string | null; citation?: string | null } = {},
): VerifyField<T> {
  if (isEmpty(value)) {
    return { value: null, status: "verify", reason: opts.reason ?? "Not found in source", citation: null };
  }
  return { value: value as T, status: "answered", reason: null, citation: opts.citation ?? null };
}

/**
 * Map a confidence label + value (as produced by structured extractors
 * like the lease abstractor) to a Verify status. A missing value, or an
 * explicit "not_found" confidence, means abstain — flag for verification
 * rather than presenting a guess. A low-confidence value that DID
 * resolve stays "answered" (it is shown with its own low-confidence
 * marker), so we don't over-flag.
 */
export function verifyStatusFromConfidence(
  confidence: string | null | undefined,
  value: unknown,
): VerifyStatus {
  if (isEmpty(value)) return "verify";
  if (confidence === "not_found") return "verify";
  return "answered";
}

export interface VerifySummary {
  total: number;
  answered: number;
  needsVerification: number;
}

/** Roll up a set of statuses for a "N fields need verification" banner. */
export function summarizeVerification(statuses: VerifyStatus[]): VerifySummary {
  const needsVerification = statuses.filter((s) => s === "verify").length;
  return {
    total: statuses.length,
    answered: statuses.length - needsVerification,
    needsVerification,
  };
}

/**
 * Prompt fragment for extractors. Paste into a structured-extraction
 * system prompt so the model emits the abstain state instead of
 * fabricating a value.
 */
export const VERIFY_CONTRACT_PROMPT = `OUTPUT CONTRACT — do not guess:
- If a value is clearly present in the source, return it and cite the page.
- If a value is missing, ambiguous, or you are not confident it is correct,
  return null and mark it "verify" with a one-line reason. Never invent a
  value or a citation. It is always better to flag a field for verification
  than to present a plausible guess as fact.`;

// Scoring logic for the call-summary eval harness.
//
// Given a case (transcript_segments + must_mention + prohibited +
// expected_citations) and the structured summary the pipeline produced,
// decide whether the case passed or failed, and if failed, which of the
// four failure conditions fired.
//
// The four failure conditions (from README.md):
//  1. material_claim_without_support — a claim with no cite_segments
//  2. citation_does_not_support — cited segment IDs exist but cited text
//     is unrelated. Approximated here as: cited segment does not share
//     any meaningful token with the claim. This is a weak check by
//     design — the stronger version runs an LLM grader offline.
//  3. missing_required_section — a must_mention fact doesn't appear
//     anywhere in the structured summary (substring or matcher).
//  4. prohibited_claim — a prohibited substring appears anywhere in the
//     summary text (hallucination guardrail).
//
// Plus a soft check: every must_mention that IS surfaced should be
// supported by at least one segment the case lists as valid. If not, we
// warn — the fact was mentioned but cited the wrong part of the call.

import type { StructuredSummary } from "@/lib/calls/summarize";

export type MustMention = {
  fact: string;
  matchers?: string[];
};

export type ProhibitedClaim = {
  claim: string;
  reason?: string;
};

export type ExpectedCitation = {
  for_fact: string;
  valid_segments: number[];
};

export type RubricCheck = {
  check: string;
  severity: "fail" | "warn";
};

export type EvalCase = {
  id: string;
  description: string;
  tags?: string[];
  transcript_segments: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
  }>;
  must_mention: MustMention[];
  prohibited?: ProhibitedClaim[];
  expected_citations: ExpectedCitation[];
  rubric?: RubricCheck[];
};

export type FailureCode =
  | "material_claim_without_support"
  | "citation_does_not_support"
  | "missing_required_section"
  | "prohibited_claim";

export type Failure = {
  code: FailureCode;
  detail: string;
};

export type Warning = {
  code: "weak_citation" | "rubric_warn";
  detail: string;
};

export type CaseResult = {
  caseId: string;
  passed: boolean;
  failures: Failure[];
  warnings: Warning[];
  verifiedPct: number | null; // verified_count / total_claims from pipeline
  summarySnippet: string; // first 200 chars of markdown for logs
};

// All text in a structured summary, concatenated for substring checks.
export function flattenSummaryText(s: StructuredSummary): string {
  const parts: string[] = [s.tldr];
  for (const p of s.key_points) parts.push(p.text);
  for (const a of s.action_items) parts.push(`${a.owner || ""} ${a.text}`);
  for (const f of s.follow_ups) parts.push(f.text);
  return parts.join("\n");
}

function matches(text: string, needle: string): boolean {
  return text.toLowerCase().includes(needle.toLowerCase());
}

function factIsMentioned(text: string, fact: MustMention): boolean {
  if (matches(text, fact.fact)) return true;
  for (const m of fact.matchers || []) {
    if (matches(text, m)) return true;
  }
  return false;
}

// Every claim in the structured summary should cite at least one segment.
// The summarizer already drops claims without citations, so this is a
// double-check — if something sneaks through, we flag it.
function claimsWithoutSupport(s: StructuredSummary): string[] {
  const out: string[] = [];
  for (const c of [...s.key_points, ...s.action_items, ...s.follow_ups]) {
    if (!c.cite_segments || c.cite_segments.length === 0) {
      out.push(c.text);
    }
  }
  return out;
}

// Weak heuristic for "citation supports claim": the cited segment's text
// shares a meaningful token (len ≥ 4, alphanumeric) with the claim text.
// This is NOT a substitute for an LLM grader — it's a tripwire for
// obviously-wrong citations (claim about RMD citing a segment about
// lunch plans). The offline grader does the deeper check.
function citationSupportsClaim(
  claimText: string,
  segmentText: string
): boolean {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 4);
  const claimTokens = new Set(normalize(claimText));
  const segTokens = new Set(normalize(segmentText));
  for (const t of claimTokens) {
    if (segTokens.has(t)) return true;
  }
  return false;
}

export function scoreCase(
  evalCase: EvalCase,
  structured: StructuredSummary | null
): CaseResult {
  const failures: Failure[] = [];
  const warnings: Warning[] = [];

  if (!structured) {
    failures.push({
      code: "missing_required_section",
      detail:
        "Pipeline returned no structured summary (raw response missing or unparseable).",
    });
    return {
      caseId: evalCase.id,
      passed: false,
      failures,
      warnings,
      verifiedPct: null,
      summarySnippet: "",
    };
  }

  const flat = flattenSummaryText(structured);
  const segmentById = new Map<number, string>();
  for (const seg of evalCase.transcript_segments) {
    segmentById.set(seg.id, seg.text);
  }

  // (1) Material claim without support
  const unsupported = claimsWithoutSupport(structured);
  for (const claim of unsupported) {
    failures.push({
      code: "material_claim_without_support",
      detail: `Claim with no citations: "${claim.slice(0, 120)}"`,
    });
  }

  // (2) Citation that does not support the claim (weak heuristic)
  for (const c of [
    ...structured.key_points,
    ...structured.action_items,
    ...structured.follow_ups,
  ]) {
    if (!c.cite_segments?.length) continue;
    const anyGood = c.cite_segments.some((sid) => {
      const segText = segmentById.get(sid);
      return segText ? citationSupportsClaim(c.text, segText) : false;
    });
    if (!anyGood) {
      failures.push({
        code: "citation_does_not_support",
        detail: `Claim "${c.text.slice(0, 80)}" cites segments [${c.cite_segments.join(
          ", "
        )}] but none share meaningful tokens with the claim.`,
      });
    }
  }

  // (3) Missing required section — every must_mention must appear
  const expectedByFact = new Map<string, number[]>();
  for (const ec of evalCase.expected_citations) {
    expectedByFact.set(ec.for_fact, ec.valid_segments);
  }
  for (const fact of evalCase.must_mention) {
    if (!factIsMentioned(flat, fact)) {
      failures.push({
        code: "missing_required_section",
        detail: `Required fact not surfaced: "${fact.fact}"`,
      });
      continue;
    }
    // Fact is mentioned — check its citations target a valid segment.
    const validSegs = expectedByFact.get(fact.fact);
    if (!validSegs || validSegs.length === 0) continue;
    const allClaims = [
      ...structured.key_points,
      ...structured.action_items,
      ...structured.follow_ups,
    ];
    const claimsCoveringFact = allClaims.filter(
      (c) =>
        matches(c.text, fact.fact) ||
        (fact.matchers || []).some((m) => matches(c.text, m))
    );
    const hasValidCite = claimsCoveringFact.some((c) =>
      c.cite_segments.some((sid) => validSegs.includes(sid))
    );
    if (!hasValidCite && claimsCoveringFact.length > 0) {
      warnings.push({
        code: "weak_citation",
        detail: `Fact "${fact.fact}" appears in the summary but cites segments outside the expected set [${validSegs.join(
          ", "
        )}].`,
      });
    }
  }

  // (4) Prohibited claims — any substring appears = hallucination
  for (const p of evalCase.prohibited || []) {
    if (matches(flat, p.claim)) {
      failures.push({
        code: "prohibited_claim",
        detail: `Prohibited claim surfaced: "${p.claim}"${
          p.reason ? ` (${p.reason})` : ""
        }`,
      });
    }
  }

  // Rubric-level warnings (advisory only)
  for (const r of evalCase.rubric || []) {
    if (r.severity === "warn") {
      warnings.push({
        code: "rubric_warn",
        detail: `Rubric check not automated: "${r.check}"`,
      });
    }
    // severity: "fail" rubric checks are not automated here — they need
    // an offline LLM grader. We surface them so a human reviewer knows
    // to check manually. They don't auto-fail the case until the grader
    // is wired up.
  }

  const verifiedPct =
    structured.total_claims > 0
      ? Math.round((structured.verified_count / structured.total_claims) * 100)
      : null;

  return {
    caseId: evalCase.id,
    passed: failures.length === 0,
    failures,
    warnings,
    verifiedPct,
    summarySnippet: flat.slice(0, 200),
  };
}

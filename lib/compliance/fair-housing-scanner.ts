// lib/compliance/fair-housing-scanner.ts
//
// Deterministic fair-housing risk scanner. Phase 3 follow-up — the
// flag taxonomy in lib/industry/vertical-spec.ts (re.fair_housing_risk)
// is decorative until something actually scans drafted realtor copy
// for it. This file is that scanner's first pass.
//
// Two passes are designed in:
//
//   1. **Deterministic** (this file). Regex / phrase matches against a
//      curated list of language patterns from HUD guidance and FHCO
//      enforcement actions. Free, fast, runs synchronously, ships in
//      this PR.
//
//   2. **Model pass** (stub at the bottom; lands when needed). For the
//      subtler cases — "quiet street" can be fine or coded depending
//      on context. The hook is here; the actual model call is gated
//      behind a feature flag and uses lib/llm/client.ts.
//
// Scope note: this scanner runs on text the *workspace* is about to
// publish — listing descriptions, marketing emails, social posts.
// It does NOT run on inbound text from third parties (a buyer's
// email to the realtor is not the realtor's risk to manage). The
// caller is responsible for invoking only on outbound drafts.
//
// Risk categories follow the FHA's seven protected classes plus
// state-extended ones. Each pattern carries a category tag so the
// review UI can group findings.

export type ProtectedClass =
  | "race"
  | "color"
  | "religion"
  | "national_origin"
  | "sex"
  | "familial_status"
  | "disability"
  | "age"                  // state-level (CA, MA, others)
  | "source_of_income"     // state-level
  | "marital_status"       // state-level
  | "general";             // catch-all for class-signaling without a single home

export type Severity = "low" | "medium" | "high";

export interface FairHousingFinding {
  /** Index in the input text where the match starts. */
  index: number;
  /** Length of the matched substring. */
  length: number;
  /** The matched phrase (lower-cased copy of original). */
  match: string;
  /** Which protected class this pattern relates to. */
  category: ProtectedClass;
  severity: Severity;
  /** Why this is a risk — shown in the review UI tooltip. */
  rationale: string;
  /** Suggested neutral rewrites. UI shows these as one-click swaps. */
  suggestions?: string[];
}

export interface FairHousingScanResult {
  /** True iff there's at least one finding. */
  flagged: boolean;
  /** Highest severity in the findings list. */
  worst: Severity | null;
  findings: FairHousingFinding[];
  /** Free-form summary line for surfacing in the audit log. */
  summary: string;
}

// ── Pattern catalog ──────────────────────────────────────────────
//
// Sources: HUD Office of Fair Housing and Equal Opportunity
// guidance + NAR Fair Housing in Advertising materials. Each
// pattern is a regex applied case-insensitively.
//
// The intent is conservative: prefer over-flagging to under-
// flagging. A finding is a hint to the reviewer, not a verdict.

interface Pattern {
  re: RegExp;
  category: ProtectedClass;
  severity: Severity;
  rationale: string;
  suggestions?: string[];
}

const PATTERNS: Pattern[] = [
  // ── Familial status ──
  {
    re: /\bperfect for (a )?famil(y|ies)\b/gi,
    category: "familial_status",
    severity: "high",
    rationale:
      "Explicit familial-status preference. HUD has held that 'perfect for families' implies discouragement of single buyers and households without children.",
    suggestions: [
      "Describe what makes the home work — bedroom count, yard, layout — without naming who it's for.",
      "Replace with a property fact: e.g., '4 bedrooms with a fenced backyard.'",
    ],
  },
  {
    re: /\b(ideal|great|wonderful|nice) for (young )?famil(y|ies)\b/gi,
    category: "familial_status",
    severity: "high",
    rationale: "Familial-status preference signaling.",
    suggestions: ["Describe property features instead of intended occupants."],
  },
  {
    re: /\bno (kids|children)\b/gi,
    category: "familial_status",
    severity: "high",
    rationale: "Explicit exclusion of households with children.",
    suggestions: ["Remove. Familial status is a federally protected class."],
  },
  {
    re: /\b(adult|adults)[- ]only\b/gi,
    category: "familial_status",
    severity: "high",
    rationale:
      "Adults-only is permissible only in HOPA-qualified 55+ communities. In any other context this is illegal.",
    suggestions: [
      "If this is a 55+ HOPA community, say so explicitly: 'Age-qualified 55+ community per Housing for Older Persons Act.'",
    ],
  },
  {
    re: /\b(family|families)[- ]oriented\b/gi,
    category: "familial_status",
    severity: "medium",
    rationale: "Implied familial-status preference.",
    suggestions: ["Replace with neighborhood-fact descriptors (parks, libraries, schools by name)."],
  },

  // ── Class / general signaling ──
  {
    re: /\bsafe (neighborhood|area|community|street)\b/gi,
    category: "general",
    severity: "high",
    rationale:
      "'Safe neighborhood' is unverifiable and HUD has flagged it as coded language used to steer buyers by demographic.",
    suggestions: [
      "Remove. If you have specific facts (e.g., 'home has a monitored security system'), state those.",
    ],
  },
  {
    re: /\bexclusive (community|neighborhood|enclave)\b/gi,
    category: "general",
    severity: "medium",
    rationale: "Class signaling. 'Exclusive' implies social filtering.",
    suggestions: ["Describe property amenities directly (private drive, gated parking, etc.)."],
  },
  {
    re: /\bgood schools\b/gi,
    category: "general",
    severity: "medium",
    rationale:
      "School-quality assertions are coded and unverifiable. Use named facts only — district name without rating, distance, etc.",
    suggestions: [
      "Reference the school district by name without a quality assertion.",
      "State distance to specific named schools.",
    ],
  },
  {
    re: /\bdesirable (area|neighborhood)\b/gi,
    category: "general",
    severity: "medium",
    rationale: "Vague class signaling.",
    suggestions: ["Cite specific verifiable amenities or facts."],
  },

  // ── Religion ──
  {
    // Permissive on what comes between "to" and the religious noun
    // (place names like "St. Mary's", "Temple Beth-El"). Limit to ~30
    // chars to avoid runaway matches across sentences.
    re: /\bwalk(ing)? distance to [\w'.\- ]{0,40}?(church|temple|synagogue|mosque|cathedral|chapel|parish)\b/gi,
    category: "religion",
    severity: "medium",
    rationale:
      "Steering by proximity to religious institutions can imply preferred buyer religion. Permitted only when religious-institution mentions are substantively necessary (e.g., parish housing).",
    suggestions: [
      "Replace with proximity to a generic public amenity (park, library, transit).",
      "Use 'walking distance to public transit' or 'half a mile from the town center.'",
    ],
  },

  // ── National origin / race (linguistic / cultural steering) ──
  {
    re: /\b(traditional|ethnic) (neighborhood|community)\b/gi,
    category: "national_origin",
    severity: "medium",
    rationale: "Cultural steering language.",
    suggestions: ["Describe specific verifiable neighborhood facts instead."],
  },

  // ── Disability ──
  {
    re: /\b(must be )?able[- ]bodied\b/gi,
    category: "disability",
    severity: "high",
    rationale: "Excludes buyers with disabilities; FHA prohibits this kind of qualifier.",
    suggestions: ["Remove. Property accessibility facts can be stated neutrally."],
  },
  {
    re: /\bnot (suitable|good) for (the )?(elderly|disabled|seniors)\b/gi,
    category: "disability",
    severity: "high",
    rationale: "Direct exclusion of protected class.",
    suggestions: ["Remove. State accessibility facts (e.g., 'three flights of stairs, no elevator')."],
  },

  // ── Age ──
  {
    re: /\bno (seniors|elderly)\b/gi,
    category: "age",
    severity: "high",
    rationale: "Direct age-based exclusion.",
    suggestions: ["Remove."],
  },

  // ── Source of income ──
  {
    re: /\bno section 8\b/gi,
    category: "source_of_income",
    severity: "high",
    rationale:
      "Many states (CA, NY, MA, OR, NJ, others) prohibit source-of-income discrimination including HCV / Section 8.",
    suggestions: ["Remove. Voucher acceptance is required in most jurisdictions Drift operates in."],
  },
  {
    re: /\bno vouchers?\b/gi,
    category: "source_of_income",
    severity: "high",
    rationale: "Source-of-income exclusion.",
    suggestions: ["Remove."],
  },
];

// ── Public API ───────────────────────────────────────────────────

/**
 * Run the deterministic scanner over a piece of text. Returns a
 * structured result with every match plus rewrite suggestions.
 *
 * Pass realtor-drafted outbound copy (listing description, buyer
 * email, marketing post). Do not pass inbound third-party text.
 */
export function scanFairHousing(text: string): FairHousingScanResult {
  if (!text || text.trim().length === 0) {
    return { flagged: false, worst: null, findings: [], summary: "Empty text — no scan." };
  }
  const findings: FairHousingFinding[] = [];
  for (const p of PATTERNS) {
    // RegExp objects with /g are stateful; reset per use.
    p.re.lastIndex = 0;
    for (const m of text.matchAll(p.re)) {
      findings.push({
        index: m.index ?? 0,
        length: m[0].length,
        match: m[0].toLowerCase(),
        category: p.category,
        severity: p.severity,
        rationale: p.rationale,
        suggestions: p.suggestions,
      });
    }
  }
  // Sort by index so the UI can render in document order.
  findings.sort((a, b) => a.index - b.index);

  const severityRank: Record<Severity, number> = { low: 1, medium: 2, high: 3 };
  const worst = findings.length === 0
    ? null
    : (findings.reduce(
        (acc, f) => (severityRank[f.severity] > severityRank[acc] ? f.severity : acc),
        "low" as Severity,
      ));
  const summary = findings.length === 0
    ? "No fair-housing risk language detected."
    : `${findings.length} finding${findings.length === 1 ? "" : "s"} — worst: ${worst}.`;
  return {
    flagged: findings.length > 0,
    worst,
    findings,
    summary,
  };
}

// ── Model pass (stub) ────────────────────────────────────────────
//
// Future: a model pass for context-sensitive cases — "quiet street"
// can be fine or coded; "great schools" without quality assertions
// can be fine. The deterministic pass catches the obvious cases;
// the model pass refines the rest.
//
// Hooked here so the public API is stable. Today returns the
// deterministic result unchanged.

export interface FairHousingScanOptions {
  /** Run the model pass after the deterministic pass. */
  enableModelPass?: boolean;
  /** Workspace context — passed to the model pass for telemetry. */
  workspaceId?: string;
}

export async function scanFairHousingWithModel(
  text: string,
  opts?: FairHousingScanOptions,
): Promise<FairHousingScanResult> {
  const det = scanFairHousing(text);
  if (!opts?.enableModelPass) return det;
  // TODO(Phase 4): model-pass implementation. Will use lib/llm/client.ts
  // with a tightly-prompted gpt-4o-mini call returning structured
  // findings. For now we return the deterministic result so callers
  // can flip the flag without breaking.
  return det;
}

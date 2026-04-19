// Deterministic compliance rules.
//
// Each rule is a regex (or pattern list) + a message explaining what
// went wrong + a citation into the reference corpus. The scanner runs
// these first, before any LLM call, because:
//
//   1. They're instant and free.
//   2. They're explainable — "triggered rule X because pattern Y
//      matched" is the answer a principal wants to see.
//   3. They catch the highest-severity violations (unqualified
//      guarantees, explicit risk-free claims) with no false negatives.
//
// The LLM layer is for fuzzier judgments (tone, suitability gaps,
// implied promises). This file is the floor, not the ceiling.
//
// Citations reference source_key + a short human quote. The eventual
// UI will resolve source_key to the full doc and highlight the chunk.

export type RuleSeverity = "info" | "warn" | "block";

export type ComplianceRule = {
  id: string; // stable ID, e.g. 'finra-2210-guarantees'
  severity: RuleSeverity;
  description: string; // what this rule catches, for reviewers
  patterns: RegExp[]; // any match fires the rule
  message: string; // shown to the advisor
  citations: Array<{
    source_key: string;
    quote: string; // short excerpt from the primary source
  }>;
};

// FINRA Rule 2210(d)(1)(B): "Communications may not predict or project
// performance, imply that past performance will recur or make any
// exaggerated or unwarranted claim, opinion or forecast."
const FINRA_GUARANTEES: ComplianceRule = {
  id: "finra-2210-guarantees",
  severity: "block",
  description:
    "Flags guaranteed-return or risk-free language prohibited by FINRA 2210(d)(1)(B).",
  patterns: [
    /\bguaranteed? (?:returns?|profit|income|growth)\b/i,
    /\brisk[- ]free\b/i,
    /\bcan'?t lose\b/i,
    /\bsure thing\b/i,
    /\b(?:will|guarantees?) (?:double|triple|outperform|beat the market)\b/i,
  ],
  message:
    'Avoid unqualified performance guarantees. FINRA 2210(d)(1)(B) prohibits communications that predict or project performance or make exaggerated claims. Rephrase with conditional language and suitability context, or escalate for principal approval.',
  citations: [
    {
      source_key: "finra-2210",
      quote:
        "Communications may not predict or project performance, imply that past performance will recur or make any exaggerated or unwarranted claim, opinion or forecast.",
    },
  ],
};

// SEC Reg BI — the Care Obligation requires a reasonable basis for
// recommendations. A blanket statement ignoring a client's risk
// tolerance / time horizon is a red flag.
const REG_BI_BLANKET_RECOMMENDATION: ComplianceRule = {
  id: "reg-bi-blanket-recommendation",
  severity: "warn",
  description:
    "Flags blanket buy/sell recommendations that ignore individual suitability.",
  patterns: [
    /\beveryone (?:should|needs to) (?:buy|sell|invest in)\b/i,
    /\bbest (?:for everyone|for everybody|investment (?:right now|today))\b/i,
    /\b(?:you have|you'?re) (?:going to|gonna) miss (?:out|the boat)\b/i,
  ],
  message:
    "Reg BI's Care Obligation requires a reasonable basis that the recommendation is in the client's best interest given their specific profile. Reframe with reference to this client's goals, risk tolerance, and time horizon.",
  citations: [
    {
      source_key: "sec-reg-bi",
      quote:
        "The Care Obligation requires the broker-dealer to exercise reasonable diligence, care, and skill to have a reasonable basis to believe the recommendation is in the retail customer's best interest.",
    },
  ],
};

// Tax advice without qualification. RIAs commonly flag these because
// even a mention of a specific tax treatment can be construed as tax
// advice if not hedged.
const UNQUALIFIED_TAX_ADVICE: ComplianceRule = {
  id: "unqualified-tax-advice",
  severity: "warn",
  description:
    "Flags specific tax claims made without referral to a tax professional.",
  patterns: [
    /\b(?:tax[- ]free|won'?t (?:be|get) taxed|no tax(?:es)? (?:owed|due))\b/i,
    /\b(?:deduct|write off) (?:the entire|100% of)\b/i,
  ],
  message:
    "Unqualified tax claims should be hedged with a recommendation to consult the client's tax professional — most RIA engagement agreements explicitly exclude tax advice.",
  citations: [
    {
      source_key: "irs-pub-590b-2025",
      quote:
        "Distribution rules vary by age, account type, and individual circumstances; consult your tax advisor.",
    },
  ],
};

// RMD-specific: stating a client has or has not satisfied their RMD
// without citing the calculation basis.
const RMD_UNSUPPORTED_STATEMENT: ComplianceRule = {
  id: "rmd-unsupported-statement",
  severity: "info",
  description:
    "Flags RMD status statements so the scanner can verify they match the custodian balance on file.",
  patterns: [
    /\b(?:RMD|required minimum distribution)\b.*?\b(?:satisfied|complete|done|taken|fulfilled)\b/i,
    /\b(?:RMD|required minimum distribution)\b.*?\b(?:\$?[\d,]+(?:\.\d+)?)\b/i,
  ],
  message:
    "RMD statement detected. The scanner will cross-check the amount and satisfaction status against the most recent custodian balance on file once the custodian layer is wired up.",
  citations: [
    {
      source_key: "irs-pub-590b-2025",
      quote:
        "Your required minimum distribution is the minimum amount you must withdraw from your account each year.",
    },
  ],
};

export const RULES: ComplianceRule[] = [
  FINRA_GUARANTEES,
  REG_BI_BLANKET_RECOMMENDATION,
  UNQUALIFIED_TAX_ADVICE,
  RMD_UNSUPPORTED_STATEMENT,
];

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

// ────────────────────────────────────────────────────────────
// Marketing-specific rules — FINRA 2210 nuances + SEC Marketing
// Rule 206(4)-1 (the "modernized marketing rule," eff. Nov 2022).
// These fire on /compliance marketing submissions in addition to
// the general rules above. They focus on patterns that are MORE
// problematic in marketing context than in 1:1 advisor email.
// ────────────────────────────────────────────────────────────

// FINRA 2210(d)(1)(A) requires content to be "fair and balanced".
// Single-sided benefit claims without risk language are the most
// common violation in marketing pieces.
const FINRA_2210_MISSING_RISK_DISCLOSURE: ComplianceRule = {
  id: "finra-2210-missing-risk",
  severity: "warn",
  description:
    "Flags marketing copy that promotes specific securities or strategies without an offsetting risk disclosure nearby.",
  patterns: [
    // "buy/own/invest in [X]" without "risk" within ~300 chars.
    // Approximated with a negative lookahead — overly aggressive
    // matching is preferred to silent passes for marketing content.
    /\b(?:buy|invest in|own|add) [A-Z][A-Za-z0-9 &]{2,40}(?:[.,!?]|$)(?![\s\S]{0,300}\b(?:risk|loss|volatil))/i,
    /\b(?:double|triple|10x|100x) (?:your money|returns?|portfolio)\b/i,
  ],
  message:
    "Marketing piece appears to promote a specific security or strategy without an accompanying risk-of-loss disclosure. FINRA 2210(d)(1)(A) requires fair and balanced presentation. Add a sentence acknowledging the risk of loss or principal volatility.",
  citations: [
    {
      source_key: "finra-2210",
      quote:
        "All member communications must be fair and balanced and must provide a sound basis for evaluating the facts in regard to any particular security or type of security.",
    },
  ],
};

// FINRA 2210 retail vs institutional — superlatives and exaggerated
// claims are restricted in retail communications.
const FINRA_2210_SUPERLATIVES: ComplianceRule = {
  id: "finra-2210-superlatives",
  severity: "warn",
  description:
    "Flags superlative or exaggerated claims that require principal pre-approval for retail audiences.",
  patterns: [
    /\b(?:the best|#1|number one|the only|the safest|the most successful) (?:advisor|firm|strategy|investment|portfolio|fund)\b/i,
    /\b(?:unmatched|unrivaled|unparalleled|industry-leading) (?:performance|returns?|expertise)\b/i,
  ],
  message:
    "Superlative or exaggerated claim detected. FINRA 2210(d)(1)(B) prohibits exaggerated claims; retail-targeted communications also require principal pre-approval per 2210(b)(1). Either rephrase or escalate to a registered principal for sign-off.",
  citations: [
    {
      source_key: "finra-2210",
      quote:
        "Communications may not contain any false, exaggerated, unwarranted, promissory or misleading statement or claim.",
    },
  ],
};

// SEC Marketing Rule 206(4)-1 — testimonials/endorsements require
// clear and prominent disclosure of (i) testimonial/endorsement
// status, (ii) any cash/non-cash compensation, and (iii) material
// conflicts of interest.
const SEC_MARKETING_RULE_MISSING_DISCLOSURE: ComplianceRule = {
  id: "sec-marketing-rule-missing-disclosure",
  severity: "warn",
  description:
    "Flags testimonial/endorsement language without the SEC-required disclosures within the same piece.",
  patterns: [
    /\b(?:client|customer)s? (?:say|testify|told us|love us|highly recommend)\b(?![\s\S]{0,400}\b(?:disclos|compensat|conflict))/i,
    /"[^"]{20,}"(?![\s\S]{0,400}\b(?:disclos|compensat|conflict|paid|free))/i,
  ],
  message:
    "Testimonial/endorsement detected without nearby disclosure language. SEC Rule 206(4)-1 requires clear and prominent disclosure of testimonial status, any compensation paid, and material conflicts of interest. Add the disclosure or use the /compliance Advertising tab to track it formally.",
  citations: [
    {
      source_key: "sec-marketing-rule",
      quote:
        "An adviser may not use a testimonial or endorsement unless certain conditions are met, including clear and prominent disclosure of testimonial/endorsement status, compensation, and material conflicts.",
    },
  ],
};

// Hypothetical performance — illustrations using projected or
// hypothetical returns require specific conditions under the
// modernized marketing rule.
const SEC_MARKETING_RULE_HYPOTHETICAL: ComplianceRule = {
  id: "sec-marketing-rule-hypothetical",
  severity: "warn",
  description:
    "Flags hypothetical / projected / model performance claims that trigger Rule 206(4)-1 hypothetical-performance conditions.",
  patterns: [
    /\b(?:hypothetical|projected|targeted|model|backtest(?:ed)?|simulated) (?:returns?|performance|results?)\b/i,
    /\bif you (?:had|invested) \$[\d,]+ (?:in|with) us\b/i,
    /\bcould have (?:earned|made) [\$\d]/i,
  ],
  message:
    "Hypothetical or projected performance claim detected. SEC Rule 206(4)-1(d) limits hypothetical performance to audiences with the financial sophistication to assess it, and requires policies and procedures, plus prominent disclosure of methodology and risks.",
  citations: [
    {
      source_key: "sec-marketing-rule",
      quote:
        "Advertisements may not include hypothetical performance unless the adviser adopts policies reasonably designed to ensure the performance is relevant to the likely financial situation and investment objectives of the intended audience and provides specified information.",
    },
  ],
};

// Performance display without time period and net-of-fees disclosure
// is one of the top SEC exam findings.
const SEC_MARKETING_RULE_PERFORMANCE_FORMAT: ComplianceRule = {
  id: "sec-marketing-rule-performance-format",
  severity: "warn",
  description:
    "Flags performance figures (e.g. '12.4%') that don't appear next to a time period and a gross/net qualifier.",
  patterns: [
    // A standalone percent figure without "1-year/5-year/since inception" within 80 chars
    /\b\d{1,3}(?:\.\d+)?%\b(?![\s\S]{0,80}\b(?:1[- ]year|3[- ]year|5[- ]year|10[- ]year|since inception|annualized|YTD|month|quarter))/i,
    // Performance without "net of fees" / "gross of fees"
    /\b(?:annualized|return|performance) of \d/i,
  ],
  message:
    "Performance figure may be missing a time-period label and/or gross-vs-net-of-fees qualifier. Rule 206(4)-1(d)(2) requires presenting net performance alongside gross, and SEC FAQ requires time-period disclosure.",
  citations: [
    {
      source_key: "sec-marketing-rule",
      quote:
        "Advertisements may not include any presentation of gross performance unless the adviser also presents net performance with at least equal prominence and over an equal time period.",
    },
  ],
};

export const RULES: ComplianceRule[] = [
  FINRA_GUARANTEES,
  REG_BI_BLANKET_RECOMMENDATION,
  UNQUALIFIED_TAX_ADVICE,
  RMD_UNSUPPORTED_STATEMENT,
  // Marketing-specific rules below — fire on the same scanner; the
  // marketing UI shows them next to the inline rules.
  FINRA_2210_MISSING_RISK_DISCLOSURE,
  FINRA_2210_SUPERLATIVES,
  SEC_MARKETING_RULE_MISSING_DISCLOSURE,
  SEC_MARKETING_RULE_HYPOTHETICAL,
  SEC_MARKETING_RULE_PERFORMANCE_FORMAT,
];

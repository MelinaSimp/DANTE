// lib/dante/eval/deal-underwriting-suite.ts
//
// Eval suite for deal underwriting and financial analysis. Tests that
// the agent correctly uses the cre.calculate tool to run due diligence
// math and provides actionable investment recommendations.
//
// Each case gives the agent a deal scenario and checks that it:
//   1. Calls the cre.calculate tool with correct inputs
//   2. Interprets the results accurately
//   3. Makes appropriate buy/pass/investigate recommendations

export const DEAL_UNDERWRITING_SUITE = {
  name: "Deal underwriting v1",
  description:
    "Tests agent ability to run CRE underwriting math via the cre.calculate " +
    "tool and interpret results for investment decision-making. Covers NOI " +
    "analysis, deal scoring, cap rate analysis, and full due diligence batteries.",
  eval_type: "agent" as const,
  tags: ["cre", "underwriting", "deal_score", "financial", "core"],
  cases: [
    // ── Case 1: Simple cap rate and deal score ────────────────────
    {
      name: "Retail strip — basic underwriting",
      input: {
        messages: [
          {
            role: "user",
            content:
              "I'm looking at a retail strip center at 5400 Pearl Rd, Parma OH. " +
              "The asking price is $2.1M. It has 5 tenants generating $185,000 in " +
              "gross rent annually with a 6% vacancy factor. Operating expenses are " +
              "$62,000/year. The seller's broker says it's a 7 cap deal. " +
              "Can you verify and run a deal score?",
          },
        ],
      },
      assertions: [
        { field: "tool_calls", op: "contains", value: "cre_calculate" },
        { field: "text", op: "contains", value: "NOI" },
        { field: "text", op: "contains", value: "cap" },
        { field: "text", op: "contains", value: "score" },
        // Agent should flag that the actual cap is ~5.2%, not 7%
        { field: "text", op: "regex", value: "5\\.[0-9]|below|less than 7|not a 7" },
      ],
      weight: 1.5,
    },

    // ── Case 2: Leveraged acquisition ─────────────────────────────
    {
      name: "Office building — leveraged DSCR analysis",
      input: {
        messages: [
          {
            role: "user",
            content:
              "We're under contract on a 20,000 SF office building in Independence OH " +
              "for $3.2M. NOI is $240,000. Our lender is quoting 70% LTV at 6.75% " +
              "over 25 years. We're putting in $960,000 equity. What's the DSCR, " +
              "cash-on-cash, and overall deal score? Is the lender going to have " +
              "a problem with the coverage ratio?",
          },
        ],
      },
      assertions: [
        { field: "tool_calls", op: "contains", value: "cre_calculate" },
        { field: "text", op: "contains", value: "DSCR" },
        { field: "text", op: "contains", value: "cash-on-cash" },
        { field: "text", op: "contains", value: "score" },
        // Agent should compute debt service and get ~$196k/yr annual DS
        // DSCR ~1.22x which is tight
        { field: "text", op: "regex", value: "tight|marginal|1\\.2|concern" },
      ],
      weight: 2.0,
    },

    // ── Case 3: Full due diligence battery ────────────────────────
    {
      name: "Industrial warehouse — full battery",
      input: {
        messages: [
          {
            role: "user",
            content:
              "Run a full underwriting battery on this industrial deal:\n\n" +
              "Property: 45,000 SF warehouse, Solon OH\n" +
              "Asking price: $4,500,000\n" +
              "Gross rent: $315,000/year\n" +
              "Vacancy: 3%\n" +
              "Other income (truck parking): $12,000/year\n" +
              "Operating expenses: $98,000/year\n" +
              "Financing: $3,150,000 loan at 6.25%, 25-year amort\n" +
              "Total equity: $1,350,000\n\n" +
              "Give me every metric you can calculate and the overall deal score.",
          },
        ],
      },
      assertions: [
        { field: "tool_calls", op: "contains", value: "cre_calculate" },
        { field: "text", op: "contains", value: "NOI" },
        { field: "text", op: "contains", value: "cap rate" },
        { field: "text", op: "contains", value: "DSCR" },
        { field: "text", op: "contains", value: "cash-on-cash" },
        { field: "text", op: "contains", value: "LTV" },
        { field: "text", op: "contains", value: "break" },
        { field: "text", op: "contains", value: "score" },
        // Should compute price/SF around $100/SF
        { field: "text", op: "regex", value: "\\$100|price per" },
      ],
      weight: 2.5,
    },

    // ── Case 4: Bad deal detection ────────────────────────────────
    {
      name: "Distressed retail — should flag concerns",
      input: {
        messages: [
          {
            role: "user",
            content:
              "My partner wants to buy this strip mall for $1.8M. Here are the numbers:\n" +
              "- Gross rent: $130,000 (but two of five suites are vacant)\n" +
              "- Vacancy: currently 40%\n" +
              "- Operating expenses: $72,000\n" +
              "- He wants to finance 80% at 7.5% over 20 years\n" +
              "- Total equity: $360,000\n\n" +
              "Run the deal score and tell me if this makes sense.",
          },
        ],
      },
      assertions: [
        { field: "tool_calls", op: "contains", value: "cre_calculate" },
        { field: "text", op: "contains", value: "score" },
        // Agent should clearly flag this as problematic
        { field: "text", op: "regex", value: "concern|risk|caution|weak|below|poor|fail|F|D" },
        // DSCR will be sub-1.0 — agent should call this out
        { field: "text", op: "regex", value: "below 1|negative|not cover|shortfall" },
      ],
      weight: 2.0,
    },

    // ── Case 5: Comparison of two deals ───────────────────────────
    {
      name: "Side-by-side deal comparison",
      input: {
        messages: [
          {
            role: "user",
            content:
              "I'm choosing between two deals. Can you score both and tell me " +
              "which is stronger?\n\n" +
              "Deal A: Flex industrial in Mentor\n" +
              "- Price: $2.8M, NOI: $210,000\n" +
              "- Loan: $1.96M at 6.5%/25yr, equity: $840K\n" +
              "- OpEx: $75K, GPR: $295K, vacancy 5%\n\n" +
              "Deal B: Retail center in Willoughby\n" +
              "- Price: $3.1M, NOI: $195,000\n" +
              "- Loan: $2.17M at 7.0%/25yr, equity: $930K\n" +
              "- OpEx: $110K, GPR: $320K, vacancy 8%",
          },
        ],
      },
      assertions: [
        { field: "tool_calls", op: "contains", value: "cre_calculate" },
        // Should score both deals
        { field: "text", op: "regex", value: "Deal A|deal A|Option A" },
        { field: "text", op: "regex", value: "Deal B|deal B|Option B" },
        { field: "text", op: "contains", value: "score" },
        // Should provide a recommendation
        { field: "text", op: "regex", value: "recommend|stronger|better|prefer|favor" },
      ],
      weight: 2.0,
    },
  ],
};

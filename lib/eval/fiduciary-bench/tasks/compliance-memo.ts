// FiduciaryBench task: compliance memo from meeting notes.
//
// What it measures: does the AI produce a memo that a CCO would
// sign without rewriting? The reference here is what a senior CCO
// would write after a meeting with the same facts. This is the
// task most directly comparable to BigLaw Bench's "draft a brief"
// style work.

import type { EvalTask } from "../types";

export const COMPLIANCE_MEMO: EvalTask = {
  slug: "compliance_memo",
  version: "1.0.0",
  category: "compliance_memo",
  title: "Compliance memo from meeting notes",
  description:
    "Given raw notes from a client meeting, draft a compliance memo a CCO would sign. Tests memo structure (parties, date, advice given, suitability rationale, risk-tolerance fit), citation discipline (firm IPS, ADV, applicable regulation), and absence of disqualifying language (specific advice on recorded line, performance promises, off-channel comms references).",
  prompt_template:
    "Draft a compliance memo from these meeting notes:\n\n\"\"\"\n{{meeting_notes}}\n\"\"\"\n\nClient name: {{client_name}}. Date: {{meeting_date}}. Advisor: {{advisor_name}}.",
  industry_scope: ["financial_advisor"],
  instances: [
    {
      id: "rebalancing_discussion",
      inputs: {
        client_name: "Smith Family Trust (joint, John & Mary Smith)",
        meeting_date: "2026-04-15",
        advisor_name: "Calvin Marsh, CFP®",
        meeting_notes:
          "Quarterly review with Smiths. Portfolio drifted ~7% over equity target due to market run. Discussed rebalancing — agreed to trim TOP 3 large-cap positions by 2% each, redirect into intermediate bonds. Mary asked about reducing allocation to international developed; we left as-is given diversification rationale. John mentioned considering early retirement at 62 instead of 65; flagged Social Security claiming impact and Medicare gap; will model in eMoney before next meeting. No specific tax-loss discussion this quarter — none in book at material level. Confirmed beneficiaries unchanged.",
      },
      expectations:
        "Memo should include: (1) parties + meeting date verbatim, (2) advisor signature line, (3) summary of issues discussed in plain-English bullets, (4) advice given (rebalance back to target, intermediate bonds), (5) advice DEFERRED (early retirement modeling — explicitly noted as deferred to next meeting, not given on the call), (6) reference to firm IPS for the rebalancing rationale, (7) note that beneficiary review was performed. Should NOT contain: specific dollar advice presented as recommendation (the trim percentages are OK as agreed-to client direction), language like 'the client should' (use 'we discussed' / 'client agreed to'). Should be 250-400 words, not a 2-page treatise.",
    },
    {
      id: "concerned_about_volatility",
      inputs: {
        client_name: "Jane Patel (sole owner)",
        meeting_date: "2026-04-20",
        advisor_name: "Calvin Marsh, CFP®",
        meeting_notes:
          "Patel called concerned about market volatility, wanted to 'go to cash for a while.' Walked through her IPS — risk tolerance moderate, time horizon 12+ years to retirement. Reminded her of 2020 / 2022 episodes where similar concern led to selling near bottom. Reviewed her cash position (~14 months expenses already in money market). Did not recommend any portfolio change. Suggested we look at her contribution rate at next quarterly to see if increasing while equities are down makes sense for DCA. She agreed not to make changes today.",
      },
      expectations:
        "This is the harder case — the memo must accurately document the conversation WITHOUT crossing into 'specific advice on a recorded line.' Good memo: documents Patel's stated concern, cites the IPS as the framework for the conversation, notes the historical context discussion (factual, not 'predictions'), confirms NO change made, notes the contribution-rate followup as a deferred item. Bad memo: 'we advised her to stay invested' (steps over the line) or 'we recommended increasing her contribution rate' (premature). Should run 200-350 words.",
    },
  ],
  // Pure judgment task. No auto grader. Human grading by ex-CCOs is
  // the only useful score here.
};

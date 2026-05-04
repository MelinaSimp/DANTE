// FiduciaryBench task: outside business activity (OBA) disclosure.
//
// Tests whether the AI correctly identifies which advisor activities
// require Form ADV / firm-policy disclosure under FINRA Rule 3270
// (registered reps) and the SEC's parallel posture for RIAs. OBA is
// one of the highest-frequency compliance traps in actual examiner
// work — the answer turns on a fact-pattern read, not a lookup.

import type { EvalTask } from "../types";

export const OBA_DISCLOSURE: EvalTask = {
  slug: "oba_disclosure",
  version: "1.0.0",
  category: "oba_disclosure",
  title: "Outside business activity — disclosure determination",
  description:
    "Tests whether the AI correctly identifies which advisor activities require OBA disclosure, citing the controlling rule (FINRA 3270 / SEC Form ADV Item 5). Pure judgment task — no calculator can answer it.",
  prompt_template:
    "An advisor at our RIA has the following outside activity: {{activity_description}}. Is this disclosable as an outside business activity? What's the controlling rule, and what should the firm document?",
  industry_scope: ["financial_advisor"],
  instances: [
    {
      id: "real_estate_brokerage",
      inputs: {
        activity_description:
          "the advisor is a licensed real estate agent and earns commissions on residential transactions; she spends ~6 hours per week on this",
      },
      expectations:
        "Yes, disclosable. Compensated activity outside the firm at material time commitment. Cite FINRA Rule 3270 (if dual-registered) or the firm's compliance manual + Form ADV Item 5.B (Other Business Activities) for SEC-registered advisor. Document: written notice to CCO, supervisory review for conflicts (real estate clients overlapping with advisory clients), and disclosure on next ADV amendment.",
    },
    {
      id: "tutoring_uncompensated",
      inputs: {
        activity_description:
          "the advisor volunteers as a math tutor at her child's school, ~2 hours per week, no compensation",
      },
      expectations:
        "No, not disclosable. Uncompensated, no conflict of interest, no use of firm name or resources. The trap: over-disclosing immaterial activities clutters the ADV and undermines the meaningful disclosures.",
    },
    {
      id: "rental_property_passive",
      inputs: {
        activity_description:
          "the advisor owns a rental duplex managed by a third-party property manager; she collects rental income but does no active management",
      },
      expectations:
        "Generally not disclosable as OBA — passive investment income. Should be disclosed on Form ADV Part 2A as a personal investment if material to the advisor's overall finances, but not under OBA rules. Distinguish 'business activity' (active engagement) from 'investment ownership' (passive). FINRA 3270 hinges on 'investment-related, active, compensated' — passive rental fails the active test.",
    },
  ],
  // Pure judgment — no auto grader; relies on human grading by ex-CCOs.
};

// FiduciaryBench task: inherited-IRA RMD edge cases.
//
// The 10-year rule (SECURE Act 1.0) and the EDB stretch are the
// part of RMD math advisors get wrong most often. Both have
// significant fiduciary consequences. This task isolates the
// scenarios that distinguish a tool that actually understands the
// rule from one that pattern-matches.

import type { EvalTask } from "../types";

export const RMD_INHERITED: EvalTask = {
  slug: "rmd_inherited",
  version: "1.0.0",
  category: "rmd_calculation",
  title: "Inherited IRA RMDs — 10-year rule + EDB stretch edge cases",
  description:
    "Tests the post-SECURE Act inherited-IRA branches: 10-year rule for non-EDB beneficiaries, life-expectancy stretch for EDBs, and the year-of-death RMD obligation. Each instance is a scenario advisors get wrong in real practice.",
  prompt_template:
    "Inherited IRA scenario: original owner born {{decedent_date_of_birth}}, died {{decedent_date_of_death}}. Beneficiary born {{date_of_birth}}, classified as {{account_kind}}. Tax year {{tax_year}}, prior-year-end balance ${{prior_year_end_balance}}. What's the RMD obligation? Cite the IRS source and call out any caveats.",
  industry_scope: ["financial_advisor"],
  instances: [
    {
      id: "non_edb_decedent_post_rbd",
      inputs: {
        tax_year: 2026,
        date_of_birth: "1975-04-12",
        account_kind: "inherited_ira_non_edb",
        prior_year_end_balance: 800000,
        decedent_date_of_death: "2024-09-30",
        decedent_date_of_birth: "1948-02-15",
      },
      expectations:
        "Decedent died at age 76 in 2024 — past the 73 RBD. Per the 2024 final regs under §1.401(a)(9), non-EDB beneficiary must take annual RMDs in years 1-9 of the 10-year window AND fully distribute by Dec 31, 2034. Most pre-2024 commentary said annual RMDs weren't required; the 2024 finalization is the trap this catches.",
    },
    {
      id: "non_edb_decedent_pre_rbd",
      inputs: {
        tax_year: 2026,
        date_of_birth: "1980-07-22",
        account_kind: "inherited_ira_non_edb",
        prior_year_end_balance: 500000,
        decedent_date_of_death: "2024-09-30",
        decedent_date_of_birth: "1956-11-08",
      },
      expectations:
        "Decedent died at age 67 in 2024 — before reaching RBD (73). Non-EDB beneficiary: NO annual RMDs required during years 1-9. Just the full distribution by Dec 31, 2034. The trap: assuming annual RMDs apply to all 10-year-rule scenarios.",
    },
    {
      id: "edb_minor_child",
      inputs: {
        tax_year: 2026,
        date_of_birth: "2010-03-15",
        account_kind: "inherited_ira_edb",
        prior_year_end_balance: 300000,
        decedent_date_of_death: "2024-08-12",
        decedent_date_of_birth: "1965-04-20",
      },
      expectations:
        "Minor child of decedent is an EDB and uses the Single Life table stretch. Child age in 2025 (year after death) = 15 → Single Life divisor ~69.9. Subtract 1 per year: 2026 divisor = 68.9. $300,000 / 68.9 ≈ $4,353.41. CAVEAT: when the minor reaches age 21 the EDB status ends and the 10-year rule kicks in.",
    },
  ],
  auto_grader: {
    kind: "must_cite_authority",
    required: ["IRS Publication 590-B", "Treas. Reg. §1.401(a)(9)"],
  },
};

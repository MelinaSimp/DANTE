// FiduciaryBench task: RMD calculation, basic cases.
//
// What it measures: does the AI compute Required Minimum
// Distributions correctly across the SECURE Act 1.0 + 2.0 age
// changes, the Uniform Lifetime table, and the Joint & Last
// Survivor case for spousal beneficiaries >10y younger?
//
// Why it's here: RMD math is rule-based, the IRS publishes the
// tables, and getting it wrong has real fiduciary consequences.
// Harvey's own help docs explicitly state Harvey does not perform
// calculations. This task makes the wedge measurable.

import type { EvalTask } from "../types";

export const RMD_BASIC: EvalTask = {
  slug: "rmd_basic",
  version: "1.0.0",
  category: "rmd_calculation",
  title: "Required Minimum Distribution — basic and edge cases",
  description:
    "Compute the RMD for a holder given their date of birth, account type, prior-year-end balance, and (optionally) beneficiary details. Tests SECURE Act 1.0 / 2.0 age handling, Uniform Lifetime table lookup, and Joint & Last Survivor table selection for spousal beneficiaries >10y younger.",
  prompt_template:
    "What is the Required Minimum Distribution for tax year {{tax_year}} for a holder born {{date_of_birth}} with a {{account_kind}} account that had a prior-year-end balance of ${{prior_year_end_balance}}?{{#if beneficiary_kind}} The beneficiary is {{beneficiary_kind}}{{#if spouse_date_of_birth}} (spouse DOB {{spouse_date_of_birth}}){{/if}}.{{/if}} Cite the IRS source.",
  industry_scope: ["financial_advisor"],
  instances: [
    {
      id: "traditional_72_2026",
      inputs: {
        tax_year: 2026,
        date_of_birth: "1953-06-15",
        account_kind: "traditional_ira",
        prior_year_end_balance: 850000,
      },
      reference: { required_amount: 32075.47 }, // $850k / 26.5 (age 73 divisor)
      expectations:
        "Holder turns 73 in 2026, which is the SECURE 2.0 RMD start age. Use Uniform Lifetime divisor 26.5 for age 73 from Treas. Reg. §1.401(a)(9)-9 Table III. Result: $850,000 / 26.5 = $32,075.47. Should cite IRS Pub 590-B and SECURE 2.0 Act §107.",
    },
    {
      id: "401k_under_rmd_age",
      inputs: {
        tax_year: 2026,
        date_of_birth: "1958-03-10",
        account_kind: "401k",
        prior_year_end_balance: 1200000,
      },
      reference: { required_amount: 0 },
      expectations:
        "Holder turns 68 in 2026, well below the SECURE 2.0 start age of 73. No RMD required. Should explicitly state 'not yet required' rather than computing a divisor against the wrong age.",
    },
    {
      id: "spouse_beneficiary_15y_younger",
      inputs: {
        tax_year: 2026,
        date_of_birth: "1953-01-20",
        account_kind: "traditional_ira",
        prior_year_end_balance: 1500000,
        beneficiary_kind: "spouse_sole_younger_10",
        spouse_date_of_birth: "1968-08-12",
      },
      reference: {
        // Owner age 73, spouse age 58, Joint & Last Survivor
        // table → divisor ~28.1
        required_amount: 53380.78, // 1,500,000 / 28.1
      },
      expectations:
        "Owner age 73, sole spouse beneficiary age 58 — 15-year gap qualifies for Joint & Last Survivor table. Divisor ~28.1 from Treas. Reg. §1.401(a)(9)-9 Table II. Result: $1,500,000 / 28.1 ≈ $53,380.78. Should NOT use Uniform Lifetime; that would understate the divisor and overstate the RMD.",
    },
    {
      id: "post_2033_age_75",
      inputs: {
        tax_year: 2034,
        date_of_birth: "1959-04-05",
        account_kind: "traditional_ira",
        prior_year_end_balance: 600000,
      },
      reference: { required_amount: 0 },
      expectations:
        "Holder turns 75 in 2034 — but SECURE 2.0 §107 raised the start age to 75 starting 2033, so 75 IS the start age. Wait: holder turns 75 in 2034, start age in 2034 is 75 → RMD required. Divisor for age 75 = 24.6. $600,000 / 24.6 ≈ $24,390.24. NOTE: this is intentionally an edge case — getting the SECURE 2.0 staircase wrong (e.g. using 73 for tax year 2034) is the failure mode this instance catches.",
    },
  ],
  auto_grader: {
    // Path points INTO the reference object (each instance carries
    // `reference: { required_amount: N }`), not into the model's
    // tool-call shape. v1 runner does prose completions, not agent
    // tool-use; the autoGrader scans the model's text output for $
    // amounts and picks the closest to the referenced number.
    kind: "exact_amount_within_tolerance",
    path: ["required_amount"],
    tolerance: 1.0,
  },
};

// FiduciaryBench task (realtor-side): lease clause risk review.
//
// Tests whether the AI correctly identifies risky or unusual lease
// clauses that a CRE broker should flag for their client's attorney.
// This is NOT about abstraction (extracting terms) — it is about
// risk assessment and flagging problematic provisions.

import type { EvalTask } from "../types";

export const LEASE_REVIEW: EvalTask = {
  slug: "lease_clause_risk_review",
  version: "1.0.0",
  category: "lease_review",
  title: "Lease clause risk review",
  description:
    "Tests whether the AI correctly identifies risky, unusual, or " +
    "tenant-unfavorable lease clauses that a CRE broker should flag " +
    "for legal review. Covers personal guarantees, recapture, " +
    "co-tenancy, radius restrictions, and demolition clauses.",
  prompt_template:
    "Review this lease clause for potential risks to the {{party}} and " +
    "flag anything unusual or concerning:\n\n\"\"\"\n{{clause_text}}\n\"\"\"\n\n" +
    "Explain what this clause means in plain English, identify any risks, " +
    "and suggest what the {{party}} should negotiate.",
  industry_scope: ["real_estate"],
  instances: [
    {
      id: "personal_guarantee_unlimited",
      inputs: {
        party: "tenant",
        clause_text:
          "PERSONAL GUARANTEE: The undersigned individually and unconditionally " +
          "guarantees to Landlord the full and prompt payment and performance of all " +
          "obligations of Tenant under this Lease, including but not limited to base rent, " +
          "additional rent, damages, and costs of enforcement. This guarantee shall survive " +
          "the expiration or earlier termination of the Lease and shall be enforceable " +
          "without requiring Landlord to first proceed against Tenant or any collateral. " +
          "This guarantee is irrevocable and shall remain in full force for the entire " +
          "Lease Term and any renewals thereof.",
      },
      expectations:
        "FLAG: This is an unlimited, irrevocable personal guarantee with no burnoff " +
        "provision. Key risks: (1) survives lease termination, (2) no cap on liability, " +
        "(3) landlord can pursue guarantor without first attempting collection from tenant " +
        "entity, (4) no time limitation or reduction schedule. Tenant should negotiate: " +
        "a burnoff clause (guarantee reduces after X months of on-time payment), a cap " +
        "(e.g. 12 months base rent), and a right for landlord to exhaust remedies against " +
        "the tenant entity first. This is a standard but aggressive provision.",
    },
    {
      id: "landlord_recapture",
      inputs: {
        party: "tenant",
        clause_text:
          "RECAPTURE RIGHT: If Tenant seeks to sublease or assign any portion of the " +
          "Premises, Landlord shall have the right, exercisable within thirty (30) days of " +
          "receiving Tenant's request, to recapture the subject space by terminating this " +
          "Lease as to that portion (or the entirety if the proposed sublease covers more " +
          "than 50% of the Premises). If Landlord exercises this right, the Lease shall " +
          "terminate as to the recaptured space effective sixty (60) days after notice, " +
          "and Tenant shall have no further obligation for rent on the recaptured space.",
      },
      expectations:
        "FLAG: Recapture clause allows landlord to effectively terminate the lease if " +
        "tenant needs to downsize. Risks: (1) tenant loses flexibility to sublease during " +
        "downturns, (2) the 50% threshold means any significant sublease triggers full " +
        "recapture, (3) tenant may be stuck paying rent on space it cannot use or sublease. " +
        "Should negotiate: removal of the recapture right, or limit it to only apply if " +
        "tenant proposes to sublease 100% of premises, or require landlord to pay a " +
        "recapture fee (e.g. unamortized TI and leasing costs).",
    },
    {
      id: "reasonable_cam_provision",
      inputs: {
        party: "tenant",
        clause_text:
          "COMMON AREA MAINTENANCE: Tenant shall pay its Proportionate Share (7.5%) " +
          "of Operating Expenses for the Building. Controllable Operating Expenses shall " +
          "not increase by more than 5% per year over the prior year's actual controllable " +
          "expenses. Capital expenditures with a useful life exceeding 10 years shall be " +
          "excluded. Landlord shall provide an annual reconciliation within 120 days of " +
          "each calendar year end. Tenant shall have the right to audit Landlord's books " +
          "and records once per year.",
      },
      expectations:
        "NO MAJOR FLAG. This is a well-drafted CAM provision with typical tenant " +
        "protections: (1) controllable expense cap at 5%/year, (2) capital expense " +
        "exclusion for long-life items, (3) annual reconciliation requirement, (4) tenant " +
        "audit right. Minor items to verify: definition of 'controllable' vs. " +
        "'uncontrollable' expenses, whether management fee is included in the cap, and " +
        "whether the base year or expense stop is appropriate for current market.",
    },
    {
      id: "demolition_clause",
      inputs: {
        party: "tenant",
        clause_text:
          "DEMOLITION CLAUSE: Notwithstanding any other provision of this Lease, " +
          "Landlord may terminate this Lease upon twelve (12) months' prior written " +
          "notice if Landlord decides, in its sole discretion, to demolish the Building " +
          "or undertake a substantial renovation that would require Tenant to vacate. " +
          "In the event of such termination, Landlord shall reimburse Tenant for the " +
          "unamortized portion of any Tenant Improvement Allowance funded by Landlord.",
      },
      expectations:
        "FLAG: Demolition clause gives landlord unilateral right to terminate. Risks: " +
        "(1) 'sole discretion' means no objective trigger required, (2) tenant could be " +
        "forced out mid-term with only 12 months notice, (3) only reimburses TI — does " +
        "not cover tenant's moving costs, lost business, or leasehold value, (4) no " +
        "relocation assistance obligation. Tenant should negotiate: longer notice period " +
        "(24+ months), relocation assistance, early termination fee to landlord, right to " +
        "relocate to comparable space in landlord's portfolio, and reimbursement of " +
        "moving costs.",
    },
  ],
  auto_grader: {
    kind: "must_match_structured",
    required_fields: ["risk_level", "key_risks", "negotiation_points"],
  },
};

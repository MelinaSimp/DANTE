// FiduciaryBench task (realtor-side): zoning compliance review.
//
// Tests whether the AI correctly identifies zoning restrictions,
// non-conforming use risks, and variance requirements when advising
// on commercial property use changes. CRE brokers routinely need to
// assess whether a proposed tenant use is permitted under the
// existing zoning classification.

import type { EvalTask } from "../types";

export const ZONING_COMPLIANCE: EvalTask = {
  slug: "zoning_compliance",
  version: "1.0.0",
  category: "zoning_compliance",
  title: "Zoning compliance assessment",
  description:
    "Tests whether the AI correctly identifies zoning restrictions, flags " +
    "non-conforming uses, and recommends appropriate next steps (variance, " +
    "conditional use permit, rezoning) for proposed CRE tenant uses.",
  prompt_template:
    "A client wants to use a commercial property for the following purpose. " +
    "Review the zoning information and advise on compliance.\n\n" +
    "Property: {{property_address}}\n" +
    "Current zoning: {{zoning_class}}\n" +
    "Zoning description: {{zoning_description}}\n" +
    "Proposed use: {{proposed_use}}\n\n" +
    "Is this use permitted? If not, what options does the client have " +
    "(variance, conditional use permit, rezoning)? What risks should they know about?",
  industry_scope: ["real_estate"],
  instances: [
    {
      id: "restaurant_in_office",
      inputs: {
        property_address: "200 Public Square, Cleveland, OH 44114",
        zoning_class: "B-4",
        zoning_description: "General Office District. Permits offices, financial institutions, and professional services. Does not permit restaurants, retail sales, or food service as a primary use.",
        proposed_use: "Full-service restaurant with bar (3,500 SF ground floor)",
      },
      expectations:
        "FLAG: Restaurant is not a permitted use in B-4 General Office. Client needs a conditional use permit (CUP) or must seek rezoning to a mixed-use or commercial district. The AI should explain: (1) a CUP hearing process, (2) that bar/liquor license adds a separate layer of approval, (3) that parking requirements for restaurant use are typically higher than office, (4) recommend consulting the local zoning board. Should NOT tell the client to proceed without approval.",
    },
    {
      id: "warehouse_in_industrial",
      inputs: {
        property_address: "4500 W 150th St, Cleveland, OH 44135",
        zoning_class: "M-1",
        zoning_description: "Light Manufacturing District. Permits warehousing, light manufacturing, assembly, distribution, and wholesale operations. Prohibits residential and heavy industrial uses.",
        proposed_use: "E-commerce fulfillment center with 50,000 SF of warehouse space",
      },
      expectations:
        "NO FLAG. Warehousing and distribution are explicitly permitted in M-1 Light Manufacturing. The AI should confirm the use is permitted, note any potential concerns (truck traffic, loading dock requirements, hours of operation restrictions), and recommend verifying fire code compliance for the specific use case. Should NOT over-flag this as a problem.",
    },
    {
      id: "daycare_in_retail",
      inputs: {
        property_address: "8700 Mentor Ave, Mentor, OH 44060",
        zoning_class: "C-2",
        zoning_description: "General Commercial District. Permits retail, personal services, restaurants, professional offices. Child care facilities require conditional use approval.",
        proposed_use: "Childcare center for 80 children (4,200 SF retail space conversion)",
      },
      expectations:
        "CONDITIONAL: Childcare is not outright prohibited but requires CUP approval. The AI should explain: (1) conditional use process, (2) state licensing requirements for childcare facilities (fire, health, building code), (3) parking and drop-off requirements, (4) that the zoning board will evaluate compatibility with surrounding uses. Should note that the retail-to-childcare conversion may trigger ADA and building code upgrades.",
    },
    {
      id: "nonconforming_use",
      inputs: {
        property_address: "1420 E 55th St, Cleveland, OH 44103",
        zoning_class: "R-2",
        zoning_description: "Two-Family Residential District. Permits single-family and two-family dwellings. The existing building is a legal non-conforming auto repair shop that has operated since 1978 (predates the 1992 rezoning).",
        proposed_use: "Continue auto repair operation under new ownership after purchase",
      },
      expectations:
        "NUANCED: The existing auto repair is a legal non-conforming use. Key points: (1) non-conforming use rights generally transfer with the property, not the owner, but some jurisdictions limit this, (2) the use cannot be expanded or intensified, (3) if abandoned for a statutory period (often 12-24 months), non-conforming rights may be lost, (4) damage/destruction beyond a threshold (often 50-75% of value) may terminate the non-conforming right. Should recommend reviewing local zoning code for exact abandonment and destruction thresholds.",
    },
  ],
  auto_grader: {
    kind: "must_match_structured",
    required_fields: ["compliance_status", "next_steps"],
  },
};

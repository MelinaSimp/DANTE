// FiduciaryBench task (realtor-side): fair-housing language review.
//
// Vergil's wedge. Tests whether the AI catches the steering and
// preference-signaling language HUD enforcement actually flags in
// real cases, vs. innocuous descriptions that aren't violations.

import type { EvalTask } from "../types";

export const FAIR_HOUSING_MARKETING: EvalTask = {
  slug: "fair_housing_marketing",
  version: "1.0.0",
  category: "fair_housing_review",
  title: "Fair-housing review of listing language",
  description:
    "Tests whether the AI flags Fair Housing Act protected-class violations in listing descriptions, distinguishing actual violations from innocuous neighborhood descriptions. Realtor-side — Vergil's compliance core.",
  prompt_template:
    "Review this listing description for Fair Housing Act compliance issues:\n\n\"\"\"\n{{listing_text}}\n\"\"\"\n\nFlag any protected-class violations (race, color, religion, national origin, sex, familial status, disability), explain the issue, suggest replacement language, and cite HUD or FHA guidance.",
  industry_scope: ["real_estate"],
  instances: [
    {
      id: "perfect_for_families",
      inputs: {
        listing_text:
          "Perfect for families! 4-bedroom colonial in a quiet neighborhood near top-rated elementary schools. Walk-up attic playroom. Master bedroom on main floor.",
      },
      expectations:
        "FLAG: 'Perfect for families' is the textbook familial-status violation under 42 U.S.C. § 3604(c). Suggested replacement: describe the property's features ('4 bedrooms, walk-up attic, main-floor master') without prescribing the buyer demographic. 'Quiet neighborhood' and 'top-rated schools' are generally OK as factual descriptors, though steering risk if used in conjunction with other signals.",
    },
    {
      id: "great_for_singles",
      inputs: {
        listing_text:
          "Studio condo great for singles or young professionals. No yard maintenance, walking distance to nightlife.",
      },
      expectations:
        "FLAG: 'Great for singles' implies preference based on familial status. Replacement: 'compact 1-bedroom layout, no exterior maintenance, walking distance to entertainment district.' Describe the property, not the intended buyer demographic.",
    },
    {
      id: "innocuous_no_flag",
      inputs: {
        listing_text:
          "3-bedroom ranch on a 0.4-acre lot. Updated kitchen with stainless appliances. New HVAC 2024. Two-car garage. Fenced backyard.",
      },
      expectations:
        "NO FLAG. Pure factual description, no protected-class signaling. The eval catches whether the model over-flags innocuous descriptions — false positives erode trust just as much as false negatives.",
    },
    {
      id: "religious_community",
      inputs: {
        listing_text:
          "Beautiful 5-bedroom in a tight-knit Christian community. Close to St. Mary's. Family-friendly cul-de-sac.",
      },
      expectations:
        "FLAG: 'Christian community' is a religious-preference signal. 'Family-friendly' is familial status. The geographic 'close to St. Mary's' is generally OK as a landmark reference; the issue is the explicit demographic framing. Replacement: '5-bedroom on a quiet cul-de-sac' — drop the demographic framing entirely.",
    },
  ],
  // Auto-grader is the existing fair-housing scanner — but the
  // human grade is the test that matters.
  auto_grader: {
    kind: "must_match_structured",
    required_fields: ["flagged", "violation_type"],
  },
};

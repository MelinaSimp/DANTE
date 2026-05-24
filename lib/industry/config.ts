// lib/industry/config.ts
//
// CRE-only configuration. Drift serves commercial real estate
// brokers and developers. The RIA vertical was removed 2026-05-24.
//
// The Industry type and getIndustryConfig function are kept so
// existing call sites don't break — they now always resolve to
// real_estate.

export type Industry = "real_estate";

export interface IndustryConfig {
  industry: Industry;
  eyebrow: string;
  shortLabel: string;
  marketingHeadline: string;
  marketingDescription: string;
  marketingChips: [string, string];
  displayName: string;
  assistantName: string;
  assistantIconPath: string;
  clientLabel: string;
  clientLabelPlural: string;
  danteHero: string;
  danteSubtitle: string;
  chatPlaceholder: string;
  starterQuestions: string[];
  seededSkills: string[];
}

const REAL_ESTATE: IndustryConfig = {
  industry: "real_estate",
  eyebrow: "FOR COMMERCIAL REAL ESTATE",
  shortLabel: "CRE broker",
  marketingHeadline: "Every parcel, researched in seconds.",
  marketingDescription:
    "Drift pulls zoning, assessed value, tax estimates, demographics, and environmental data from county public records the moment you type an address. Link your own Phase I, lease abstract, or zoning letter and the AI cites the exact section -- your 40-hour research package, searchable.",
  marketingChips: ["Parcel intelligence", "Citation-grounded"],
  displayName: "CRE Broker",
  assistantName: "Dante",
  assistantIconPath: "/brand/vergil-echo-black.png",
  clientLabel: "client",
  clientLabelPlural: "clients",
  danteHero: "What do you need today?",
  danteSubtitle: "Search a parcel, pull demographics, draft a lease abstract.",
  chatPlaceholder: "Search parcels near an address, pull a property report, draft an email…",
  starterQuestions: [
    "Find C-2 parcels over 1 acre near {address}",
    "Pull the full report on {address}",
    "Which clients haven't heard from me in 30+ days?",
    "Prep me for my 2 PM meeting",
  ],
  seededSkills: [
    "draft_listing_prep_recap",
    "summarize_recent_buyer_emails",
    "prep_briefing_for_showing",
  ],
};

export const ALL_INDUSTRIES: Industry[] = ["real_estate"];

export const SIGNUP_INDUSTRIES: Industry[] = ["real_estate"];

export function getIndustryConfig(_industry?: string | null | undefined): IndustryConfig {
  return REAL_ESTATE;
}

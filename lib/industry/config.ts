// lib/industry/config.ts
//
// Per-vertical configuration. We sell the same product to two
// distinct buyers — financial advisors and real-estate agents —
// and route copy + seeded skills through this single config layer
// so divergences land without `if (industry === ...)` sprinkled in
// component code.

export type Industry = "financial_advisor" | "real_estate";

export interface IndustryConfig {
  industry: Industry;
  /** Eyebrow shown above marketing headlines (e.g. "FOR FINANCIAL ADVISORS"). */
  eyebrow: string;
  /** Short label for radio buttons / tabs. */
  shortLabel: string;
  /** Marketing headline on auth/signup surfaces. */
  marketingHeadline: string;
  /** Supporting paragraph below the headline. */
  marketingDescription: string;
  /** Two short chip labels rendered under the description. */
  marketingChips: [string, string];
  /** Display name for the vertical, shown in headings. */
  displayName: string;
  /** Brand name of the LLM assistant for this vertical (Dante / Vergil). */
  assistantName: string;
  /** Path under /public to the assistant's brand mark (gate / echo). */
  assistantIconPath: string;
  /** What the primary person is called in this vertical. */
  clientLabel: string;
  /** Plural form of clientLabel. */
  clientLabelPlural: string;
  /** Hero heading on the /dante landing. */
  danteHero: string;
  /** Subheading / descriptor below the hero. */
  danteSubtitle: string;
  /** Placeholder text for the main chat input. */
  chatPlaceholder: string;
  /** Suggested starter questions shown on the landing surface. */
  starterQuestions: string[];
  /** Slugs of skills seeded into new workspaces of this vertical. */
  seededSkills: string[];
}

const FINANCIAL_ADVISOR: IndustryConfig = {
  industry: "financial_advisor",
  eyebrow: "FOR FINANCIAL ADVISORS",
  shortLabel: "Financial advisor",
  marketingHeadline: "Every answer, traced to a source.",
  marketingDescription:
    "Drift grounds every call summary, meeting brief, and compliance check in the exact transcript segment, document chunk, or custodian balance it came from. A compliance officer can hover any claim and see where it came from.",
  marketingChips: ["Citation-grounded", "Audit packet"],
  displayName: "Financial Advisor",
  assistantName: "Dante",
  assistantIconPath: "/brand/dante-double-gate-black.png",
  clientLabel: "client",
  clientLabelPlural: "clients",
  danteHero: "What do you need today?",
  danteSubtitle: "Ask about a client, draft a letter, run a portfolio review.",
  chatPlaceholder: "Ask about a client, draft an email, summarize a call…",
  starterQuestions: [
    "Summarize my last call with {client}",
    "Draft a quarterly review email for {client}",
    "Which clients haven't heard from me in 30+ days?",
    "Prep me for my 2 PM meeting",
  ],
  seededSkills: [
    "draft_review_meeting_recap",
    "summarize_recent_emails",
    "prep_briefing_for_meeting",
  ],
};

const REAL_ESTATE: IndustryConfig = {
  industry: "real_estate",
  eyebrow: "FOR REAL ESTATE AGENTS",
  shortLabel: "Real estate agent",
  marketingHeadline: "Every lead, followed up on time.",
  marketingDescription:
    "Drift answers the showing line, books tours, and writes the recap email before you're back in the car. Every claim traces to the listing, the showing transcript, or the buyer's stated budget — so nothing gets misquoted to the wrong party.",
  marketingChips: ["Always-on receptionist", "Tour recap"],
  displayName: "Real Estate Agent",
  assistantName: "Vergil",
  assistantIconPath: "/brand/vergil-echo-black.png",
  clientLabel: "client",
  clientLabelPlural: "clients",
  danteHero: "What do you need today?",
  danteSubtitle: "Ask about a client, draft a listing recap, prep for a showing.",
  chatPlaceholder: "Ask about a client, draft an email, prep for a showing…",
  starterQuestions: [
    "Summarize my last call with {client}",
    "Draft a listing prep recap for {address}",
    "Which buyers haven't heard from me in 30+ days?",
    "Prep me for my 2 PM showing",
  ],
  seededSkills: [
    "draft_listing_prep_recap",
    "summarize_recent_buyer_emails",
    "prep_briefing_for_showing",
  ],
};

// Industries we recognise. Used by getIndustryConfig to detect
// unexpected values (legacy / corrupted rows) and warn loudly in
// development without breaking production.
const KNOWN_INDUSTRIES = new Set<string>(["financial_advisor", "real_estate"]);

const CONFIGS: Record<Industry, IndustryConfig> = {
  financial_advisor: FINANCIAL_ADVISOR,
  real_estate: REAL_ESTATE,
};

export const ALL_INDUSTRIES: Industry[] = ["financial_advisor", "real_estate"];

// SIGNUP_INDUSTRIES — the subset shown to NEW users on the signup
// industry picker. ALL_INDUSTRIES stays unchanged so existing
// real_estate workspaces continue to function (their per-vertical
// prompts, memory taxonomy, fair-housing scanner, and all Vergil-
// flavored copy still work via getIndustryConfig). This narrows the
// front door without killing the back rooms.
//
// Why: per the panel review of 2026-05-03, the team picked wealth-
// only as the focus call. Vergil isn't being deleted — it's being
// removed from public acquisition surfaces so net-new signups go
// to the advisor vertical where the credibility hire, custodian
// integrations, and regulatory data corpus all compound. If the
// realtor side comes back as a primary acquisition channel later,
// flip this constant back to ALL_INDUSTRIES.
export const SIGNUP_INDUSTRIES: Industry[] = ["financial_advisor"];

// Resolves a workspace's industry to its config. Falls back to
// financial_advisor (the primary persona) for null / unknown values
// so the UI never crashes on legacy rows. In development we warn
// when an unexpected non-null value sneaks through, since that
// usually means the column has drifted from the whitelist used at
// signup (auth/callback) — a realtor stuck on the advisor config is
// a real bug, just not a fatal one.
export function getIndustryConfig(industry: string | null | undefined): IndustryConfig {
  if (industry === "real_estate") return CONFIGS.real_estate;
  if (industry === "financial_advisor") return CONFIGS.financial_advisor;
  if (
    industry != null &&
    industry !== "" &&
    !KNOWN_INDUSTRIES.has(industry) &&
    process.env.NODE_ENV !== "production"
  ) {
    console.warn(
      `[industry] unrecognised industry "${industry}" — falling back to financial_advisor`,
    );
  }
  return CONFIGS.financial_advisor;
}

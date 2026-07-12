// lib/industry/config.ts
//
// Platform-neutral configuration. Dante is a horizontal AI agent &
// workflow builder — this config carries the default copy for every
// workspace. Industry-specific packs (e.g. the Drift CRE template)
// will land as marketplace templates, not hardcoded verticals.
//
// NOTE: the Industry type key remains "real_estate" for now — it is
// referenced by regulatory/compliance/sms modules as an internal
// legacy key and is renamed in the workspace-templates plan. The
// copy below is what users see; the key is not user-facing.

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

const GENERAL: IndustryConfig = {
  industry: "real_estate", // legacy internal key — see file header
  eyebrow: "ALL-IN-ONE AGENTIC PLATFORM",
  shortLabel: "builder",
  marketingHeadline: "Agents, sites, and workflows — grounded.",
  marketingDescription:
    "Dante is the all-in-one agentic platform. Build agents, publish them to sites, and run workflows on an almost hallucination-free LLM — for anyone, no code required.",
  marketingChips: ["Almost hallucination-free", "Agents + sites"],
  displayName: "Business",
  assistantName: "Dante",
  assistantIconPath: "/brand/dante-sword.png",
  clientLabel: "contact",
  clientLabelPlural: "contacts",
  danteHero: "What should we build today?",
  danteSubtitle: "Ask a question, search your documents, or automate a process.",
  chatPlaceholder: "Ask about your documents, draft an email, build a workflow…",
  starterQuestions: [
    "What can you do?",
    "Summarize the documents I uploaded this week",
    "Which contacts haven't heard from me in 30+ days?",
    "Build a workflow that emails me a daily digest",
  ],
  seededSkills: [
    "draft_follow_up_email",
    "summarize_recent_emails",
    "prep_meeting_briefing",
  ],
};

export const ALL_INDUSTRIES: Industry[] = ["real_estate"];

export const SIGNUP_INDUSTRIES: Industry[] = ["real_estate"];

export function getIndustryConfig(_industry?: string | null | undefined): IndustryConfig {
  return GENERAL;
}

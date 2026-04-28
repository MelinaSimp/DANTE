// lib/industry/skills.ts
//
// Default Dante/Vergil skills seeded into a workspace on first
// onboarding completion. Skill *bodies* (objective, system prompt,
// tools, IO schema) live here in TypeScript so they're versioned in
// the repo alongside the rest of the product. The slugs that map to
// each vertical are listed in lib/industry/config.ts → seededSkills.
//
// Advisor slugs match the rows seeded by the original Phase 3
// migration (20260425040000_seed_default_skills.sql). Realtor slugs
// are net-new — see 20260428000000_seed_realtor_skills.sql for the
// backfill into existing realtor workspaces.

import type { Industry } from "./config";

export interface SkillSeed {
  name: string;
  description: string;
  config: {
    objective: string;
    system: string;
    tools: string[];
    max_steps: number;
  };
  input_schema: {
    type: "object";
    required: string[];
    properties: Record<string, { type: string }>;
  };
  /** false = client-facing output, requires advisor/agent approval before mutating tools fire. */
  auto_approve: boolean;
}

const DRAFT_REVIEW_MEETING_RECAP: SkillSeed = {
  name: "draft_review_meeting_recap",
  description:
    "Draft a follow-up email recapping a client review meeting, grounded in memory + vault citations.",
  config: {
    objective:
      "Draft a follow-up email to {{input.contact_name}} recapping our meeting today. Pull recent context from memory, cite any vault documents that support advice you reference, and end with a clear list of next steps each side committed to. Meeting notes: {{input.meeting_notes}}",
    system:
      "You are drafting on behalf of a financial advisor. Keep it warm but professional. Always ground specific recommendations in vault citations using the [v1] [v2] markers from vault.cite.",
    tools: ["memory.search", "vault.cite"],
    max_steps: 6,
  },
  input_schema: {
    type: "object",
    required: ["contact_id", "contact_name", "meeting_notes"],
    properties: {
      contact_id: { type: "string" },
      contact_name: { type: "string" },
      meeting_notes: { type: "string" },
    },
  },
  auto_approve: false,
};

const SUMMARIZE_RECENT_EMAILS: SkillSeed = {
  name: "summarize_recent_emails",
  description:
    "Roll up the last 14 days of correspondence with a contact into a 4-bullet brief the advisor can read before a call.",
  config: {
    objective:
      'Search memory for episode-kind entries with source_kind="email" about contact {{input.contact_id}} from the last 14 days. Summarize them as 4 bullets focusing on: (1) any concerns raised, (2) any commitments either side made, (3) the emotional tone of recent exchanges, (4) anything still open. Be concise.',
    system:
      "You are summarizing for a financial advisor about to call this client. They have 90 seconds to read this. No fluff.",
    tools: ["memory.search"],
    max_steps: 4,
  },
  input_schema: {
    type: "object",
    required: ["contact_id"],
    properties: { contact_id: { type: "string" } },
  },
  auto_approve: true,
};

const PREP_BRIEFING_FOR_MEETING: SkillSeed = {
  name: "prep_briefing_for_meeting",
  description:
    "Surface what the advisor needs to know before a meeting: open promises, recent concerns, pending action items.",
  config: {
    objective:
      "Prepare a meeting brief for contact {{input.contact_id}}. Pull facts and summaries from memory. Surface: (a) anything the advisor previously promised this client and hasn't closed out, (b) any concerns raised in recent correspondence or calls, (c) one suggested opener that references a personal detail (family, hobby) if memory has one. Output as markdown with headers.",
    system:
      "You are briefing a financial advisor 5 minutes before they walk into a meeting. They want to feel prepared, not buried in detail.",
    tools: ["memory.search", "archive.search"],
    max_steps: 5,
  },
  input_schema: {
    type: "object",
    required: ["contact_id"],
    properties: { contact_id: { type: "string" } },
  },
  auto_approve: true,
};

const DRAFT_LISTING_PREP_RECAP: SkillSeed = {
  name: "draft_listing_prep_recap",
  description:
    "Draft a recap email after a listing-prep walkthrough, grounded in memory + property details.",
  config: {
    objective:
      "Draft a follow-up email to {{input.contact_name}} recapping today's walkthrough at {{input.property_address}}. Pull recent context from memory, cite any vault documents (comps, prep checklists) that support recommendations, and end with a clear list of what we're each doing before the listing goes live. Walkthrough notes: {{input.walkthrough_notes}}",
    system:
      "You are drafting on behalf of a real-estate agent. Warm, specific, and free of jargon. Ground concrete claims (comps, repair costs, pricing) in vault citations using the [v1] [v2] markers from vault.cite.",
    tools: ["memory.search", "vault.cite"],
    max_steps: 6,
  },
  input_schema: {
    type: "object",
    required: [
      "contact_id",
      "contact_name",
      "property_address",
      "walkthrough_notes",
    ],
    properties: {
      contact_id: { type: "string" },
      contact_name: { type: "string" },
      property_address: { type: "string" },
      walkthrough_notes: { type: "string" },
    },
  },
  auto_approve: false,
};

const SUMMARIZE_RECENT_BUYER_EMAILS: SkillSeed = {
  name: "summarize_recent_buyer_emails",
  description:
    "Roll up the last 14 days of correspondence with a buyer or seller into a 4-bullet brief the agent can read before a showing or call.",
  config: {
    objective:
      'Search memory for episode-kind entries with source_kind="email" about contact {{input.contact_id}} from the last 14 days. Summarize them as 4 bullets focusing on: (1) what they\'re looking for or willing to compromise on, (2) any commitments either side made (showings booked, docs sent), (3) the emotional tone (excited, hesitant, frustrated), (4) anything still open. Be concise.',
    system:
      "You are summarizing for a real-estate agent about to call this contact or walk into a showing with them. They have 90 seconds to read this. No fluff.",
    tools: ["memory.search"],
    max_steps: 4,
  },
  input_schema: {
    type: "object",
    required: ["contact_id"],
    properties: { contact_id: { type: "string" } },
  },
  auto_approve: true,
};

const PREP_BRIEFING_FOR_SHOWING: SkillSeed = {
  name: "prep_briefing_for_showing",
  description:
    "Surface what the agent needs to know before a showing: stated must-haves, deal-breakers, prior properties seen, open commitments.",
  config: {
    objective:
      "Prepare a showing brief for contact {{input.contact_id}}{{#if input.property_address}} at {{input.property_address}}{{/if}}. Pull facts and summaries from memory. Surface: (a) what they've said is non-negotiable vs. nice-to-have, (b) properties they've already seen and what they liked/disliked, (c) anything the agent previously promised that hasn't been closed out, (d) one personal detail (family, hobby, motivation) the agent can lead with. Output as markdown with headers.",
    system:
      "You are briefing a real-estate agent 5 minutes before a showing. They want to feel prepared, not buried in detail.",
    tools: ["memory.search", "archive.search"],
    max_steps: 5,
  },
  input_schema: {
    type: "object",
    required: ["contact_id"],
    properties: {
      contact_id: { type: "string" },
      property_address: { type: "string" },
    },
  },
  auto_approve: true,
};

const REGISTRY: Record<string, SkillSeed> = {
  draft_review_meeting_recap: DRAFT_REVIEW_MEETING_RECAP,
  summarize_recent_emails: SUMMARIZE_RECENT_EMAILS,
  prep_briefing_for_meeting: PREP_BRIEFING_FOR_MEETING,
  draft_listing_prep_recap: DRAFT_LISTING_PREP_RECAP,
  summarize_recent_buyer_emails: SUMMARIZE_RECENT_BUYER_EMAILS,
  prep_briefing_for_showing: PREP_BRIEFING_FOR_SHOWING,
};

export function getSkillSeed(slug: string): SkillSeed | null {
  return REGISTRY[slug] ?? null;
}

const DEFAULTS: Record<Industry, string[]> = {
  financial_advisor: [
    "draft_review_meeting_recap",
    "summarize_recent_emails",
    "prep_briefing_for_meeting",
  ],
  real_estate: [
    "draft_listing_prep_recap",
    "summarize_recent_buyer_emails",
    "prep_briefing_for_showing",
  ],
};

export function defaultSkillSlugsFor(industry: Industry): string[] {
  return DEFAULTS[industry];
}

export function defaultSkillSeedsFor(industry: Industry): SkillSeed[] {
  return DEFAULTS[industry]
    .map((slug) => REGISTRY[slug])
    .filter((s): s is SkillSeed => Boolean(s));
}

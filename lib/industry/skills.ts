// lib/industry/skills.ts
//
// Default CRE skills seeded into a workspace on first onboarding
// completion. Skill bodies (objective, system prompt, tools, IO
// schema) live here in TypeScript so they're versioned in the repo.
// RIA skills removed 2026-05-24.

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

const ABSTRACT_LEASE: SkillSeed = {
  name: "abstract_lease",
  description:
    "Extract key terms from a commercial lease into a structured abstract with vault citations.",
  config: {
    objective:
      'Abstract the lease for {{input.property_name}}. {{#if input.document_id}}Use vault document ID {{input.document_id}}.{{else}}Search the vault for the lease document.{{/if}} Run targeted vault.cite queries to extract every standard CRE lease field: parties, premises, term, rent schedule, escalations, percentage rent breakpoint, CAM/operating expenses, tax escalation/pass-through, security deposit, TI allowance, permitted use, exclusivity, assignment/subletting, termination provisions, renewal/expansion options, SNDA/estoppel, holdover rate, environmental/hazmat provisions, insurance requirements, default/remedies, parking, and signage. Present each field with its vault citation inline. Flag any standard fields not found in the document. If the document is an amendment or modification (not a full lease), label the output as "Amendment Abstract," note the original lease it amends, and abstract only the changed terms. If it is a letter of intent, label as "LOI Summary" and note terms are non-binding. Output as structured markdown matching the lease abstract format. {{#if input.notes}}Additional context: {{input.notes}}{{/if}}',
    system:
      "You are abstracting a commercial lease on behalf of a CRE broker. Accuracy is paramount — every number, date, and name must carry a vault citation. Do not invent terms. If a field is not in the document, say 'Not found in document.' Output structured markdown, not prose. Run as many vault.cite passes as needed — a partial abstract is unacceptable. Before writing each section, verify you have a [vN] citation for every number, date, and name. If you don't, run another vault.cite query rather than writing uncited.",
    tools: ["vault.cite", "archive.search"],
    max_steps: 25,
  },
  input_schema: {
    type: "object",
    required: ["property_name"],
    properties: {
      property_name: { type: "string" },
      document_id: { type: "string" },
      notes: { type: "string" },
    },
  },
  auto_approve: true,
};

const PSA_REDLINE_ANALYSIS: SkillSeed = {
  name: "psa_redline_analysis",
  description:
    "Upload a Purchase and Sale Agreement. Get a structured analysis of non-standard clauses, risk flags, and seller/buyer favorability assessment with citations.",
  config: {
    objective:
      'Analyze the Purchase and Sale Agreement for {{input.property_name}}. {{#if input.document_id}}Use vault document ID {{input.document_id}}.{{else}}Search the vault for the PSA document.{{/if}} Perform a clause-by-clause redline analysis against market-standard CRE purchase agreements. For each material clause, determine whether it is standard or non-standard. For non-standard clauses, assess whether the deviation favors the buyer, the seller, or is neutral, and explain the practical impact. Specifically examine: purchase price and earnest money terms, financing and loan contingencies, due diligence period and scope, inspection rights and remedies, title and survey requirements, closing conditions and timeline, representations and warranties, default and remedies provisions, assignment and assumption rights, environmental and hazmat provisions, prorations and adjustments, risk of loss allocation, broker commission terms, and any unusual addenda or side agreements. Flag items that warrant negotiation or legal review before execution. All findings must carry inline vault citations using [vN] markers. {{#if input.notes}}Additional context from the broker: {{input.notes}}{{/if}}',
    system:
      "You are analyzing a CRE Purchase and Sale Agreement on behalf of a commercial real estate broker. Accuracy is critical -- every clause assessment must be grounded in the actual document language with a vault citation. Compare each provision against market-standard CRE purchase agreement terms. Do not speculate about terms not present in the document; instead note them as missing. Output structured markdown with clear section headers. For each non-standard clause, state the deviation, which party it favors, the risk level (high / medium / low), and a recommended negotiation position. Run as many vault.cite passes as needed to ensure full coverage.",
    tools: ["vault.cite", "archive.search"],
    max_steps: 20,
  },
  input_schema: {
    type: "object",
    required: ["property_name"],
    properties: {
      property_name: { type: "string" },
      document_id: { type: "string" },
      notes: { type: "string" },
    },
  },
  auto_approve: true,
};

const BROKER_EMAIL_DRAFT: SkillSeed = {
  name: "broker_email_draft",
  description:
    "Draft a professional CRE email from deal context, contact history, and relevant terms.",
  config: {
    objective:
      'Draft a professional email to {{input.contact_name}} regarding {{input.subject_context}}. Pull recent interaction history and deal context from memory for contact {{input.contact_id}}. {{#if input.property_address}}Reference the property at {{input.property_address}} and any relevant vault documents (lease abstracts, LOIs, comps, PSAs) that support the message.{{/if}} The email should be professional but warm in tone, reference specific deal details or prior conversations to show continuity, and close with a clear next-step CTA (schedule a call, submit documents, confirm terms, tour a property). {{#if input.notes}}Broker notes on what to cover: {{input.notes}}{{/if}}',
    system:
      "You are drafting an email on behalf of a CRE broker. Tone should be professional, direct, and warm -- not stiff or overly formal. Reference concrete deal facts and prior interactions to demonstrate attentiveness. Ground any claims about property terms, comps, or deal status in vault citations using [vN] markers where applicable. Keep the email concise -- brokers and their clients respect brevity. Always end with a single, clear call to action.",
    tools: ["memory.search", "vault.cite"],
    max_steps: 6,
  },
  input_schema: {
    type: "object",
    required: ["contact_id", "contact_name", "subject_context"],
    properties: {
      contact_id: { type: "string" },
      contact_name: { type: "string" },
      subject_context: { type: "string" },
      property_address: { type: "string" },
      notes: { type: "string" },
    },
  },
  auto_approve: false,
};

const REGISTRY: Record<string, SkillSeed> = {
  draft_listing_prep_recap: DRAFT_LISTING_PREP_RECAP,
  summarize_recent_buyer_emails: SUMMARIZE_RECENT_BUYER_EMAILS,
  prep_briefing_for_showing: PREP_BRIEFING_FOR_SHOWING,
  abstract_lease: ABSTRACT_LEASE,
  psa_redline_analysis: PSA_REDLINE_ANALYSIS,
  broker_email_draft: BROKER_EMAIL_DRAFT,
};

export function getSkillSeed(slug: string): SkillSeed | null {
  return REGISTRY[slug] ?? null;
}

const DEFAULTS: string[] = [
  "draft_listing_prep_recap",
  "summarize_recent_buyer_emails",
  "prep_briefing_for_showing",
  "abstract_lease",
  "psa_redline_analysis",
  "broker_email_draft",
];

export function defaultSkillSlugsFor(_industry?: Industry): string[] {
  return DEFAULTS;
}

export function defaultSkillSeedsFor(_industry?: Industry): SkillSeed[] {
  return DEFAULTS
    .map((slug) => REGISTRY[slug])
    .filter((s): s is SkillSeed => Boolean(s));
}

// lib/vapi/cre-scenarios.ts
//
// Ready-to-deploy CRE voice scenarios using the JSONB scenario graph
// format (mode="scenario" on the agents table). Each scenario compiles
// through scenarioToSystemPrompt() into the deterministic step-script
// that VAPI feeds the LLM at call time.
//
// Three scenarios for v1:
//   1. Inbound listing qualification — caller reaches firm's listing line
//   2. Outbound owner prospecting — broker initiates outreach campaign
//   3. Lease expiration notification — automated renewal reminder
//
// Usage: pick a template, optionally customize phone numbers / names,
// then assign it to an agent's `scenario` JSONB column with mode="scenario".

import type { Scenario } from "./scenario-prompt";

export interface CREScenarioTemplate {
  key: string;
  name: string;
  description: string;
  scenario: Scenario;
  suggestedFirstMessage: string;
  suggestedAgentName: string;
}

// ── 1. Inbound Listing Qualification ──────────────────────────────

export const INBOUND_QUALIFICATION: CREScenarioTemplate = {
  key: "cre_inbound_qualification",
  name: "Inbound Listing Qualification",
  description:
    "Qualifies inbound callers for commercial listings. Identifies the property of interest, timeline, budget range, entity type, and intended use, then routes to the appropriate broker or voicemail.",
  suggestedFirstMessage:
    "Hello, thank you for calling. I can help you with information about our listings. Could I get your name to start?",
  suggestedAgentName: "Drift Listing Line",
  scenario: {
    version: 1,
    entry: "greet",
    nodes: [
      {
        id: "greet",
        type: "say",
        text: "Hello, thank you for calling. I can help you with information about our listings. Could I get your name to start?",
      },
      {
        id: "identify_interest",
        type: "branch",
        prompt:
          "Which property or type of space are you interested in? For example, do you have a specific address in mind, or are you looking for a particular type of space like office, retail, industrial, or flex?",
        branches: [
          { match: "office, office space, professional, co-working", next: "qualify_office" },
          { match: "retail, storefront, restaurant, shop", next: "qualify_retail" },
          { match: "industrial, warehouse, distribution, logistics", next: "qualify_industrial" },
          { match: "specific address, specific property, particular building", next: "qualify_specific" },
        ],
        default: "qualify_general",
      },
      {
        id: "qualify_office",
        type: "branch",
        prompt:
          "Great, office space. A few quick questions: What size range are you looking for in square feet? What is your target move-in timeline? And will the lease be under a business entity or individual name?",
        branches: [
          { match: "ready now, immediate, ASAP, this month, urgent", next: "schedule_showing" },
          { match: "exploring, just looking, next year, no rush", next: "collect_contact" },
        ],
        default: "schedule_showing",
      },
      {
        id: "qualify_retail",
        type: "branch",
        prompt:
          "Retail space, understood. What type of business will occupy the space? What square footage do you need? And when are you looking to be open for business?",
        branches: [
          { match: "ready now, immediate, ASAP, this month, urgent", next: "schedule_showing" },
          { match: "exploring, just looking, next year, no rush", next: "collect_contact" },
        ],
        default: "schedule_showing",
      },
      {
        id: "qualify_industrial",
        type: "branch",
        prompt:
          "Industrial space. What are your requirements for ceiling height, loading docks, or power capacity? What square footage range? And what is your timeline?",
        branches: [
          { match: "ready now, immediate, ASAP, this month, urgent", next: "schedule_showing" },
          { match: "exploring, just looking, next year, no rush", next: "collect_contact" },
        ],
        default: "schedule_showing",
      },
      {
        id: "qualify_specific",
        type: "branch",
        prompt:
          "Which property are you asking about? If you have an address or listing name, I can check availability. Otherwise I can describe what we have on the market right now.",
        branches: [
          { match: "available, is it available, still on market", next: "schedule_showing" },
        ],
        default: "schedule_showing",
      },
      {
        id: "qualify_general",
        type: "branch",
        prompt:
          "No problem. To help match you with the right options: what type of commercial space are you looking for, what size, and when do you need to be in?",
        branches: [
          { match: "ready now, immediate, ASAP, urgent", next: "schedule_showing" },
          { match: "just looking, exploring, not sure", next: "collect_contact" },
        ],
        default: "schedule_showing",
      },
      {
        id: "schedule_showing",
        type: "branch",
        prompt:
          "I would love to set up a time for you to tour the space with one of our brokers. What days and times work best for you this week or next?",
        branches: [
          { match: "yes, sure, sounds good, let's do it, works for me", next: "confirm_showing" },
          { match: "no, not yet, send info, email me", next: "collect_contact" },
        ],
        default: "confirm_showing",
      },
      {
        id: "confirm_showing",
        type: "say",
        text: "Excellent. I have noted your availability and our team will confirm the showing details shortly. What is the best phone number and email to reach you for the confirmation?",
      },
      {
        id: "collect_contact",
        type: "say",
        text: "Understood. Could I get your best phone number and email? Our broker will follow up with available options that match what you described.",
      },
      {
        id: "closing",
        type: "say",
        text: "Thank you for calling. A member of our team will be in touch soon. Have a great day.",
      },
      {
        id: "vm_general",
        type: "voicemail",
        prompt:
          "You have reached our listing line. No one is available to take your call right now. Please leave your name, number, and a brief message about which property or type of space you are interested in, and we will return your call promptly.",
        label: "Inbound Listing Inquiry",
      },
    ],
  },
};

// ── 2. Outbound Owner Prospecting ─────────────────────────────────

export const OUTBOUND_PROSPECTING: CREScenarioTemplate = {
  key: "cre_outbound_prospecting",
  name: "Outbound Owner Prospecting",
  description:
    "Proactive outreach to commercial property owners. Introduces the firm, pitches market expertise, asks about portfolio plans, handles objections, and books a meeting.",
  suggestedFirstMessage:
    "Hi, this is calling from the brokerage team. Am I speaking with the property owner?",
  suggestedAgentName: "Drift Outbound",
  scenario: {
    version: 1,
    entry: "intro",
    nodes: [
      {
        id: "intro",
        type: "say",
        text: "Hi, this is calling from the brokerage team. I am reaching out because we specialize in commercial properties in your area and wanted to touch base about your portfolio.",
      },
      {
        id: "confirm_owner",
        type: "branch",
        prompt: "Am I speaking with the property owner or someone who manages the property?",
        branches: [
          { match: "yes, that's me, I'm the owner, I own it, correct", next: "pitch" },
          { match: "no, wrong number, not interested, do not call", next: "polite_exit" },
          { match: "property manager, manager, I manage, managing agent", next: "pitch" },
        ],
        default: "pitch",
      },
      {
        id: "pitch",
        type: "branch",
        prompt:
          "We have been tracking market activity in your area and there is strong demand right now. Have you considered any changes to your portfolio — whether that is selling, repositioning, or refinancing?",
        branches: [
          { match: "selling, considering selling, might sell, disposition, liquidate", next: "qualify_seller" },
          { match: "refinancing, refi, loan, debt", next: "qualify_refi" },
          { match: "not interested, no, happy where I am, not selling", next: "soft_objection" },
          { match: "tell me more, what do you mean, what market activity", next: "market_context" },
        ],
        default: "soft_objection",
      },
      {
        id: "qualify_seller",
        type: "branch",
        prompt:
          "That is great to hear. A few quick questions so our team can provide the most relevant market data: What type of property is it? What is the approximate square footage? And do you have a timeline in mind for a potential sale?",
        branches: [
          { match: "ready, soon, this year, looking to move", next: "book_meeting" },
          { match: "later, not sure, exploring, maybe next year", next: "book_meeting" },
        ],
        default: "book_meeting",
      },
      {
        id: "qualify_refi",
        type: "say",
        text: "Understood. Our team works closely with capital markets specialists who can run the numbers on current rates for your property type. I would like to set up a brief call with one of our advisors to discuss options.",
      },
      {
        id: "market_context",
        type: "say",
        text: "Of course. We have seen cap rates compress in your submarket over the last two quarters, and several comparable properties have traded above asking. Our team can put together a confidential market analysis specific to your property. Would a brief meeting to review that be useful?",
      },
      {
        id: "soft_objection",
        type: "branch",
        prompt:
          "Completely understand. Many owners we speak with are not actively looking to sell but still find value in knowing what their property could fetch in the current market. Would a no-obligation market valuation be useful, even just for your records?",
        branches: [
          { match: "yes, sure, okay, why not, could be useful", next: "book_meeting" },
          { match: "no, not interested, stop calling, remove me", next: "polite_exit" },
        ],
        default: "polite_exit",
      },
      {
        id: "book_meeting",
        type: "say",
        text: "Excellent. I will have one of our senior brokers reach out to schedule a brief meeting at your convenience. What is the best phone number and email to reach you, and are mornings or afternoons generally better?",
      },
      {
        id: "polite_exit",
        type: "say",
        text: "No problem at all. Thank you for your time. If anything changes in the future, our team is always available. Have a great day.",
      },
      {
        id: "vm_prospecting",
        type: "voicemail",
        prompt:
          "Hi, this is calling from the brokerage team. I was reaching out regarding your commercial property. We have some market activity in your area that may be relevant. When you have a moment, please call us back. Thank you.",
        label: "Outbound Prospecting",
      },
    ],
  },
};

// ── 3. Lease Expiration Notification ──────────────────────────────

export const LEASE_EXPIRATION_NOTIFICATION: CREScenarioTemplate = {
  key: "cre_lease_expiration",
  name: "Lease Expiration Notification",
  description:
    "Automated outreach to tenants approaching lease expiration. Notifies them of the renewal deadline, offers to schedule a meeting with the broker, and captures their intent.",
  suggestedFirstMessage:
    "Hello, this is calling regarding your lease. Is this a good time for a brief update?",
  suggestedAgentName: "Drift Lease Renewal",
  scenario: {
    version: 1,
    entry: "greet",
    nodes: [
      {
        id: "greet",
        type: "say",
        text: "Hello, this is calling regarding your lease. I have a quick update about your upcoming renewal deadline.",
      },
      {
        id: "confirm_tenant",
        type: "branch",
        prompt: "Am I speaking with the right person regarding the lease at this property?",
        branches: [
          { match: "yes, that's me, correct, speaking", next: "notify_expiration" },
          { match: "no, wrong person, wrong number", next: "wrong_contact" },
        ],
        default: "notify_expiration",
      },
      {
        id: "notify_expiration",
        type: "branch",
        prompt:
          "Your current lease is approaching its expiration date. We wanted to reach out early so you have time to evaluate your options — whether that is renewing at the current location, negotiating new terms, or exploring other spaces. Have you given any thought to what you would like to do?",
        branches: [
          { match: "renew, stay, want to renew, keep the space, happy here", next: "renewal_interest" },
          { match: "leaving, moving, not renewing, looking elsewhere", next: "departure_interest" },
          { match: "not sure, haven't decided, need to think, depends on terms", next: "undecided" },
        ],
        default: "undecided",
      },
      {
        id: "renewal_interest",
        type: "say",
        text: "Great to hear you are interested in staying. Our broker can walk you through the renewal terms and negotiate on your behalf to make sure you are getting the best possible deal. Would you like to schedule a meeting to discuss the details?",
      },
      {
        id: "departure_interest",
        type: "say",
        text: "Understood. Our team can help you with the transition — making sure you meet all notice requirements and, if you need a new space, we can assist with that search as well. Would you like to set up a time to discuss your options?",
      },
      {
        id: "undecided",
        type: "branch",
        prompt:
          "That is completely normal at this stage. A quick meeting with our broker could help clarify your options and any financial implications. There is no commitment — just information to help you decide. Would you like to set up a brief call?",
        branches: [
          { match: "yes, sure, okay, sounds good, set it up", next: "schedule" },
          { match: "no, not now, I'll call back, send email", next: "collect_contact" },
        ],
        default: "schedule",
      },
      {
        id: "schedule",
        type: "say",
        text: "Perfect. What days and times work best for you? Our broker can be flexible with scheduling.",
      },
      {
        id: "collect_contact",
        type: "say",
        text: "No problem. Could I confirm your best email and phone number so our broker can send over a summary of your options and renewal timeline?",
      },
      {
        id: "wrong_contact",
        type: "say",
        text: "I apologize for the confusion. Could you point me to the right person to speak with about the lease? A name or phone number would be helpful.",
      },
      {
        id: "closing",
        type: "say",
        text: "Thank you for your time. Our team will follow up with you shortly. Have a great day.",
      },
      {
        id: "vm_expiration",
        type: "voicemail",
        prompt:
          "Hello, this is calling about your upcoming lease expiration. We wanted to reach out to discuss your renewal options before the deadline. Please call us back at your convenience. Thank you.",
        label: "Lease Expiration",
      },
    ],
  },
};

export const CRE_SCENARIO_TEMPLATES: CREScenarioTemplate[] = [
  INBOUND_QUALIFICATION,
  OUTBOUND_PROSPECTING,
  LEASE_EXPIRATION_NOTIFICATION,
];

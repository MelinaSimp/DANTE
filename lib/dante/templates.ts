// lib/dante/templates.ts
//
// Pre-built workflow templates for CRE brokers and developers. Each
// template defines a real WorkflowGraph that users can clone with one
// click into their own workspace, then tweak in the visual editor.
//
// Kept in code (vs a DB table) so templates are version-controlled
// alongside the runner and can evolve with step-type changes. The
// /api/dante/templates/[slug]/clone endpoint reads this module and
// inserts a fresh dante_workflows row with the graph copied.
//
// Each graph must:
//   - have exactly one trigger node
//   - use only step types the runner knows about (see workflow-types.ts)
//   - reference prior step outputs via {{steps.<id>.<path>}} templates

import type { WorkflowGraph } from "./workflow-types";

export interface WorkflowTemplate {
  slug: string;
  name: string;
  description: string;
  category: "Deal pipeline" | "Lease management" | "Client communication" | "Operations" | "Prospecting" | "Site intelligence" | "Due diligence" | "Risk management";
  icon: string;
  accent: "verified" | "ink" | "accent" | "flag";
  triggerLabel: string;
  requiresVault?: boolean;
  graph: WorkflowGraph;
}

// ── Graph helpers ─────────────────────────────────────────────

const X = 60;
const row = (i: number) => ({ x: X, y: 40 + i * 150 });
const edge = (src: string, dst: string, handle?: "true" | "false") => ({
  id: `${src}->${dst}${handle ? `-${handle}` : ""}`,
  source: src,
  target: dst,
  ...(handle ? { sourceHandle: handle } : {}),
});

// ══════════════════════════════════════════════════════════════
// 1 - Lease expiration outreach (cron)
// ══════════════════════════════════════════════════════════════

const leaseExpirationGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "Daily at 9am ET",
        config: { cron: "0 9 * * *", timezone: "America/New_York" },
      } },
    },
    {
      id: "properties", type: "query_properties", position: row(1),
      data: { step: {
        id: "properties", type: "query_properties", name: "Properties with active leases",
        config: { filter: {}, limit: 100 },
      } },
    },
    {
      id: "evaluate", type: "agent", position: row(2),
      data: { step: {
        id: "evaluate", type: "agent", name: "Filter expiring leases + draft outreach",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a CRE operations assistant. Given a list of properties with lease data, identify those with lease_end_date within the next 90 days. For each, compose a professional SMS and email draft notifying the tenant and broker team that the lease expiration is approaching and offering to discuss renewal options.",
          objective: "Review properties from the previous step. Filter to those whose lease_end_date falls within the next 90 days from today. For each qualifying property, draft a personalized SMS for the tenant and a summary for the broker. Return the filtered list as JSON.",
          tools: ["clients.query", "memory.search"],
          max_steps: 6,
          output_schema: {
            type: "object",
            properties: {
              expiring: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    property_id: { type: "string" },
                    address: { type: "string" },
                    tenant_name: { type: "string" },
                    lease_end_date: { type: "string" },
                    monthly_rent: { type: "string" },
                    sms_body: { type: "string" },
                    email_body: { type: "string" },
                  },
                  required: ["property_id", "address", "lease_end_date"],
                },
              },
            },
            required: ["expiring"],
          },
        },
      } },
    },
    {
      id: "check", type: "condition", position: row(3),
      data: { step: {
        id: "check", type: "condition", name: "Any expiring?",
        config: {
          expression: "{{steps.evaluate.output.expiring.length}} > 0",
          on_false: "stop",
        },
      } },
    },
    {
      id: "notify", type: "send_email", position: row(4),
      data: { step: {
        id: "notify", type: "send_email", name: "Email broker team digest",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Lease expirations approaching -- {{steps.evaluate.output.expiring.length}} properties",
          text: "The following leases expire within 90 days. Outreach drafts are ready for review:\n\n{{steps.evaluate.output.expiring}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "properties"),
    edge("properties", "evaluate"),
    edge("evaluate", "check"),
    edge("check", "notify", "true"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 2 - Tenant renewal drip sequence (cron)
// ══════════════════════════════════════════════════════════════

const tenantRenewalDripGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "Weekly Mondays 8am ET",
        config: { cron: "0 8 * * 1", timezone: "America/New_York" },
      } },
    },
    {
      id: "properties", type: "query_properties", position: row(1),
      data: { step: {
        id: "properties", type: "query_properties", name: "All properties with lease dates",
        config: { filter: {}, limit: 200 },
      } },
    },
    {
      id: "leases", type: "lease_lookup", position: row(2),
      data: { step: {
        id: "leases", type: "lease_lookup", name: "Pull abstracted lease terms",
        config: { status: "completed", limit: 100 },
      } },
    },
    {
      id: "triage", type: "openai", position: row(3),
      data: { step: {
        id: "triage", type: "openai", name: "Bucket into 90/60/30-day cohorts",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a CRE operations analyst. Return JSON only.",
          prompt: "Today's date: {{steps.trigger.input.fired_at}}\n\nProperties:\n{{steps.properties.properties}}\n\nLease abstracts:\n{{steps.leases.abstracts}}\n\nFor each property with a lease ending within 90 days, assign it to a cohort: '90_day' (61-90 days out), '60_day' (31-60 days out), or '30_day' (1-30 days out). For each, draft an appropriate email: 90-day is a gentle heads-up about upcoming renewal, 60-day is a check-in asking about renewal intentions, 30-day is urgent action required. Return JSON: [{ property_id, address, tenant_name, cohort, days_remaining, email_subject, email_body }].",
          max_tokens: 2000,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Send renewal digest to broker",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Tenant renewal pipeline -- weekly update",
          text: "This week's renewal cohorts and draft communications:\n\n{{steps.triage.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "properties"),
    edge("properties", "leases"),
    edge("leases", "triage"),
    edge("triage", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 3 - New listing distribution (webhook)
// ══════════════════════════════════════════════════════════════

const newListingDistributionGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_webhook", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_webhook", name: "New listing webhook",
        config: {},
      } },
    },
    {
      id: "buyers", type: "query_clients", position: row(1),
      data: { step: {
        id: "buyers", type: "query_clients", name: "Active buyer/tenant contacts",
        config: { filter: {}, limit: 200 },
      } },
    },
    {
      id: "match", type: "openai", position: row(2),
      data: { step: {
        id: "match", type: "openai", name: "Match listing to buyer requirements",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a CRE listing distribution specialist. Match a new listing against buyer/tenant requirements. Return JSON only.",
          prompt: "New listing details:\nAddress: {{steps.trigger.input.address}}\nProperty type: {{steps.trigger.input.property_type}}\nSize: {{steps.trigger.input.square_feet}} SF\nAsking price: {{steps.trigger.input.asking_price}}\nSubmarket: {{steps.trigger.input.submarket}}\n\nActive buyers/tenants:\n{{steps.buyers.contacts}}\n\nReturn [{ contact_id, name, email, match_reason }] for every contact whose requirements (price_range, property_focus, location preferences) align with this listing. Include a one-sentence match_reason explaining why.",
          max_tokens: 1200,
        },
      } },
    },
    {
      id: "blast", type: "openai", position: row(3),
      data: { step: {
        id: "blast", type: "openai", name: "Draft personalized blast emails",
        config: {
          model: "claude-sonnet-4-6",
          system: "You draft professional, concise CRE listing announcement emails. Each email should reference why this listing matches the recipient's known requirements. No fluff -- brokers respect brevity.",
          prompt: "Listing: {{steps.trigger.input.address}}, {{steps.trigger.input.property_type}}, {{steps.trigger.input.square_feet}} SF at {{steps.trigger.input.asking_price}}\n\nMatched contacts:\n{{steps.match.text}}\n\nFor each matched contact, draft a personalized email (subject + body). Return JSON: [{ contact_id, name, email, subject, body }].",
          max_tokens: 1500,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Send drafts to broker for review",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "New listing blast ready -- {{steps.trigger.input.address}}",
          text: "Matched contacts and personalized email drafts for the new listing:\n\n{{steps.blast.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "buyers"),
    edge("buyers", "match"),
    edge("match", "blast"),
    edge("blast", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 4 - Deal pipeline stage nudge (cron)
// ══════════════════════════════════════════════════════════════

const dealStageNudgeGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "Weekdays 8:30am ET",
        config: { cron: "30 8 * * 1-5", timezone: "America/New_York" },
      } },
    },
    {
      id: "properties", type: "query_properties", position: row(1),
      data: { step: {
        id: "properties", type: "query_properties", name: "All active pipeline properties",
        config: { filter: { transaction_stage: "neq:closed" }, limit: 200 },
      } },
    },
    {
      id: "offers", type: "query_offers", position: row(2),
      data: { step: {
        id: "offers", type: "query_offers", name: "Pending and active offers",
        config: { filter: { status: "neq:closed" }, limit: 200 },
      } },
    },
    {
      id: "analyze", type: "openai", position: row(3),
      data: { step: {
        id: "analyze", type: "openai", name: "Flag stalled deals",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a CRE deal operations analyst. Return JSON only.",
          prompt: "Today: {{steps.trigger.input.fired_at}}\n\nProperties in pipeline:\n{{steps.properties.properties}}\n\nActive offers:\n{{steps.offers.offers}}\n\nIdentify deals that appear stalled:\n- Properties in 'showing' stage for >14 days\n- Properties in 'offer' stage for >7 days with no accepted offer\n- Properties in 'pending' stage past their expected_close_date\n- Offers in 'pending' status for >5 days\n- Offers expiring within 48 hours\n\nReturn [{ property_id, address, stage, days_in_stage, issue, suggested_action, urgency: 'high'|'medium'|'low' }]. Sort by urgency desc.",
          max_tokens: 1200,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Email deal nudge report",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Deal pipeline -- stalled deals flagged",
          text: "Deals requiring attention today:\n\n{{steps.analyze.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "properties"),
    edge("properties", "offers"),
    edge("offers", "analyze"),
    edge("analyze", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 5 - Comp survey report (cron)
// ══════════════════════════════════════════════════════════════

const compSurveyGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "Fridays 4pm ET",
        config: { cron: "0 16 * * 5", timezone: "America/New_York" },
      } },
    },
    {
      id: "listings", type: "query_listings", position: row(1),
      data: { step: {
        id: "listings", type: "query_listings", name: "Recent listing activity",
        config: { filter: {}, limit: 100 },
      } },
    },
    {
      id: "closed", type: "query_offers", position: row(2),
      data: { step: {
        id: "closed", type: "query_offers", name: "Recently closed offers",
        config: { filter: { status: "closed" }, limit: 50 },
      } },
    },
    {
      id: "report", type: "openai", position: row(3),
      data: { step: {
        id: "report", type: "openai", name: "Compile weekly comp report",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a CRE market analyst. Write a concise, professional weekly comp report. Use tables where helpful. No speculation -- only report what the data shows.",
          prompt: "Week ending: {{steps.trigger.input.fired_at}}\n\nActive/recent listings:\n{{steps.listings.listings}}\n\nRecently closed deals:\n{{steps.closed.offers}}\n\nCompile a weekly comp survey covering:\n1. New listings this week (address, type, size, asking price)\n2. Deals closed this week (address, sale price, price/SF, days on market)\n3. Notable pricing trends (avg asking price/SF, avg sale price/SF)\n4. Properties to watch (large spreads between ask and offer, long DOM)\n\nFormat as a professional email body.",
          max_tokens: 1500,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Distribute comp report",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Weekly comp survey -- {{steps.trigger.input.fired_at}}",
          text: "{{steps.report.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "listings"),
    edge("listings", "closed"),
    edge("closed", "report"),
    edge("report", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 6 - Property tour follow-up (webhook)
// ══════════════════════════════════════════════════════════════

const tourFollowupGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_webhook", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_webhook", name: "Tour completed webhook",
        config: {},
      } },
    },
    {
      id: "leases", type: "lease_lookup", position: row(1),
      data: { step: {
        id: "leases", type: "lease_lookup", name: "Pull lease terms for property",
        config: { status: "completed", limit: 5 },
      } },
    },
    {
      id: "draft", type: "openai", position: row(2),
      data: { step: {
        id: "draft", type: "openai", name: "Draft tour follow-up email",
        config: {
          model: "claude-sonnet-4-6",
          system: "You write professional, specific follow-up emails from a CRE broker after a property tour. Reference concrete details about the property. Keep it under 200 words.",
          prompt: "Tour details:\nProperty: {{steps.trigger.input.property_address}}\nAttendee: {{steps.trigger.input.attendee_name}} ({{steps.trigger.input.attendee_email}})\nRecap: {{steps.trigger.input.recap}}\nOutcome: {{steps.trigger.input.outcome}}\n\nLease terms (if available):\n{{steps.leases.abstracts}}\n\nDraft a follow-up email that:\n1. Thanks them for their time\n2. References specific features they liked or concerns they raised\n3. Includes a clear next-step CTA (schedule a second showing, submit an LOI, connect with lender)\n\nReturn JSON: { subject, body }.",
          max_tokens: 600,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(3),
      data: { step: {
        id: "email", type: "send_email", name: "Send to broker for review",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Tour follow-up draft -- {{steps.trigger.input.property_address}}",
          text: "Review and send to {{steps.trigger.input.attendee_name}}:\n\n{{steps.draft.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "leases"),
    edge("leases", "draft"),
    edge("draft", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 7 - Stale listing alert (cron)
// ══════════════════════════════════════════════════════════════

const staleListingGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "Wednesdays 9am ET",
        config: { cron: "0 9 * * 3", timezone: "America/New_York" },
      } },
    },
    {
      id: "listings", type: "query_listings", position: row(1),
      data: { step: {
        id: "listings", type: "query_listings", name: "All active listings",
        config: { filter: { status: "active" }, limit: 200 },
      } },
    },
    {
      id: "analyze", type: "openai", position: row(2),
      data: { step: {
        id: "analyze", type: "openai", name: "Flag stale listings",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a CRE listing analyst. Return JSON only.",
          prompt: "Today: {{steps.trigger.input.fired_at}}\n\nActive listings:\n{{steps.listings.listings}}\n\nFlag listings that may need attention:\n- Listed for >60 days with no offers\n- Listing expiring within 30 days\n- Price per SF significantly above recent comps in the same submarket\n\nReturn [{ listing_id, property_id, address, list_date, days_on_market, list_price_cents, issue, recommendation }]. Sort by days_on_market desc.",
          max_tokens: 1000,
        },
      } },
    },
    {
      id: "check", type: "condition", position: row(3),
      data: { step: {
        id: "check", type: "condition", name: "Any stale?",
        config: {
          expression: "{{steps.analyze.text}} contains \"listing_id\"",
          on_false: "stop",
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Send stale listing report",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Stale listings -- action needed",
          text: "The following listings may need a price adjustment or marketing refresh:\n\n{{steps.analyze.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "listings"),
    edge("listings", "analyze"),
    edge("analyze", "check"),
    edge("check", "email", "true"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 8 - Commission tracking and close-date reminder (cron)
// ══════════════════════════════════════════════════════════════

const commissionTrackingGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "Mondays 7am ET",
        config: { cron: "0 7 * * 1", timezone: "America/New_York" },
      } },
    },
    {
      id: "offers", type: "query_offers", position: row(1),
      data: { step: {
        id: "offers", type: "query_offers", name: "Accepted offers with closing targets",
        config: { filter: { status: "accepted" }, limit: 100 },
      } },
    },
    {
      id: "listings", type: "query_listings", position: row(2),
      data: { step: {
        id: "listings", type: "query_listings", name: "Listings with commission data",
        config: { filter: { status: "pending" }, limit: 100 },
      } },
    },
    {
      id: "report", type: "openai", position: row(3),
      data: { step: {
        id: "report", type: "openai", name: "Build commission pipeline report",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a CRE operations analyst specializing in transaction management. Write concise, numbers-driven reports.",
          prompt: "Today: {{steps.trigger.input.fired_at}}\n\nAccepted offers (pending close):\n{{steps.offers.offers}}\n\nPending listings with commission rates:\n{{steps.listings.listings}}\n\nProduce a commission pipeline report:\n1. Deals closing this week (address, sale price, commission %, estimated commission $)\n2. Deals closing this month (same fields)\n3. Total estimated commission this month\n4. Any deals past their closing_target that haven't closed yet (flag as at-risk)\n\nFormat as a professional email body with clear dollar amounts.",
          max_tokens: 1200,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Email commission report",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Commission pipeline -- week of {{steps.trigger.input.fired_at}}",
          text: "{{steps.report.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "offers"),
    edge("offers", "listings"),
    edge("listings", "report"),
    edge("report", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 9 - COI expiration tracker (cron)
// ══════════════════════════════════════════════════════════════

const coiExpirationGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "1st and 15th of each month",
        config: { cron: "0 9 1,15 * *", timezone: "America/New_York" },
      } },
    },
    {
      id: "docs", type: "archive_lookup", position: row(1),
      data: { step: {
        id: "docs", type: "archive_lookup", name: "Search for insurance / COI documents",
        config: {
          query: "certificate of insurance COI expiration renewal tenant insurance requirements",
          k: 15,
          kind: "insurance",
        },
      } },
    },
    {
      id: "check", type: "condition", position: row(2),
      data: { step: {
        id: "check", type: "condition", name: "Any COI docs found?",
        config: {
          expression: "{{steps.docs.count}} > 0",
          on_false: "stop",
        },
      } },
    },
    {
      id: "drafts", type: "openai", position: row(3),
      data: { step: {
        id: "drafts", type: "openai", name: "Draft COI renewal notices",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a CRE compliance assistant. You review insurance documents and draft professional, firm but friendly renewal notices from a property manager to tenants.",
          prompt: "Today: {{steps.trigger.input.fired_at}}\n\nInsurance / COI documents from the archive:\n{{steps.docs.context}}\n\nReview these documents for any certificates of insurance that are expiring within the next 60 days. For each expiring COI, draft a tenant notice:\n- State the lease requirement for valid insurance\n- Note the current expiration date\n- Request updated certificate by 15 days before expiration\n\nIf no COIs are expiring soon, say so. Otherwise return the drafted notices.",
          max_tokens: 1200,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Send COI digest to broker",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "COI expirations -- tenant notices drafted",
          text: "Review and send the following insurance renewal notices:\n\n{{steps.drafts.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "docs"),
    edge("docs", "check"),
    edge("check", "drafts", "true"),
    edge("drafts", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 10 - Investor portfolio report (cron)
// ══════════════════════════════════════════════════════════════

const investorReportGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "1st of each month",
        config: { cron: "0 9 1 * *", timezone: "America/New_York" },
      } },
    },
    {
      id: "properties", type: "query_properties", position: row(1),
      data: { step: {
        id: "properties", type: "query_properties", name: "All managed properties",
        config: { filter: {}, limit: 200 },
      } },
    },
    {
      id: "leases", type: "lease_lookup", position: row(2),
      data: { step: {
        id: "leases", type: "lease_lookup", name: "Current lease terms",
        config: { status: "completed", limit: 100 },
      } },
    },
    {
      id: "clients", type: "query_clients", position: row(3),
      data: { step: {
        id: "clients", type: "query_clients", name: "Investor/landlord contacts",
        config: { filter: {}, limit: 100 },
      } },
    },
    {
      id: "report", type: "openai", position: row(4),
      data: { step: {
        id: "report", type: "openai", name: "Generate portfolio summary",
        config: {
          model: "claude-sonnet-4-6",
          system: "You produce professional monthly CRE portfolio reports for landlord/investor clients. Use tables, keep it factual, include dollar figures.",
          prompt: "Month: {{steps.trigger.input.fired_at}}\n\nProperties under management:\n{{steps.properties.properties}}\n\nLease terms:\n{{steps.leases.abstracts}}\n\nInvestor contacts:\n{{steps.clients.contacts}}\n\nFor each investor, produce a portfolio summary:\n1. Properties they own (address, occupancy, monthly rent)\n2. Lease expirations upcoming in next 6 months\n3. Vacancy status and estimated market rent for vacant units\n4. Total monthly revenue across their portfolio\n\nReturn JSON: [{ investor_name, investor_email, report_body }].",
          max_tokens: 2000,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(5),
      data: { step: {
        id: "email", type: "send_email", name: "Send reports to broker for distribution",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Monthly investor reports -- ready for review",
          text: "Review and forward to each investor:\n\n{{steps.report.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "properties"),
    edge("properties", "leases"),
    edge("leases", "clients"),
    edge("clients", "report"),
    edge("report", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 11 - Lease abstraction completion alert (webhook)
// ══════════════════════════════════════════════════════════════

const leaseAbstractionAlertGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_webhook", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_webhook", name: "Lease abstraction webhook",
        config: {},
      } },
    },
    {
      id: "leases", type: "lease_lookup", position: row(1),
      data: { step: {
        id: "leases", type: "lease_lookup", name: "Fetch completed abstraction",
        config: { status: "completed", limit: 1 },
      } },
    },
    {
      id: "summary", type: "openai", position: row(2),
      data: { step: {
        id: "summary", type: "openai", name: "Summarize key terms + flag risks",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a CRE lease analyst. Summarize extracted lease terms clearly and flag any unusual clauses or risks (below-market rent, missing escalation, short notice periods, onerous co-tenancy clauses).",
          prompt: "Lease abstraction result:\n{{steps.leases.abstracts}}\n\nProperty: {{steps.trigger.input.property_address}}\nTenant: {{steps.trigger.input.tenant_name}}\n\nProduce:\n1. A one-paragraph executive summary of the key lease terms\n2. A table of the 10 most important terms (name, value)\n3. Risk flags -- any clauses that are unusual, tenant-favorable, or missing\n\nFormat as a professional email body.",
          max_tokens: 1000,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(3),
      data: { step: {
        id: "email", type: "send_email", name: "Email lease summary to broker",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Lease abstracted -- {{steps.trigger.input.property_address}}",
          text: "{{steps.summary.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "leases"),
    edge("leases", "summary"),
    edge("summary", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 12 - Prospect re-engagement (cron)
// ══════════════════════════════════════════════════════════════

const prospectReengagementGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "Tuesdays 9am ET",
        config: { cron: "0 9 * * 2", timezone: "America/New_York" },
      } },
    },
    {
      id: "clients", type: "query_clients", position: row(1),
      data: { step: {
        id: "clients", type: "query_clients", name: "All contacts",
        config: { filter: {}, limit: 500 },
      } },
    },
    {
      id: "listings", type: "query_listings", position: row(2),
      data: { step: {
        id: "listings", type: "query_listings", name: "Current active listings",
        config: { filter: { status: "active" }, limit: 50 },
      } },
    },
    {
      id: "match", type: "openai", position: row(3),
      data: { step: {
        id: "match", type: "openai", name: "Find stale prospects with matching inventory",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a CRE prospecting specialist. Return JSON only.",
          prompt: "Today: {{steps.trigger.input.fired_at}}\n\nContacts:\n{{steps.clients.contacts}}\n\nActive listings:\n{{steps.listings.listings}}\n\nIdentify contacts who:\n1. Haven't had any activity in 30+ days (based on created_at or last touch)\n2. Match at least one current active listing based on their known requirements\n\nFor each, draft a short re-engagement email that mentions the specific listing. Return [{ contact_id, name, email, days_since_contact, matching_listing_address, email_subject, email_body }].",
          max_tokens: 1500,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Send re-engagement drafts",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Prospect re-engagement -- stale contacts with matching inventory",
          text: "These prospects haven't been contacted recently but match your current listings:\n\n{{steps.match.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "clients"),
    edge("clients", "listings"),
    edge("listings", "match"),
    edge("match", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 13 - Due diligence checklist (webhook)
// ══════════════════════════════════════════════════════════════

const dueDiligenceGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_webhook", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_webhook", name: "Offer accepted webhook",
        config: {},
      } },
    },
    {
      id: "leases", type: "lease_lookup", position: row(1),
      data: { step: {
        id: "leases", type: "lease_lookup", name: "Existing lease abstractions",
        config: { status: "completed", limit: 10 },
      } },
    },
    {
      id: "archive", type: "archive_lookup", position: row(2),
      data: { step: {
        id: "archive", type: "archive_lookup", name: "Firm DD checklist template",
        config: {
          query: "Due diligence checklist, inspection timeline, environmental review, title search, survey requirements",
          k: 5, kind: "policy",
        },
      } },
    },
    {
      id: "checklist", type: "openai", position: row(3),
      data: { step: {
        id: "checklist", type: "openai", name: "Generate DD checklist",
        config: {
          model: "claude-sonnet-4-6",
          system: "You produce thorough, actionable due diligence checklists for CRE transactions. Cite firm policy where available. Include deadlines relative to the closing target. Be concise but complete — use bullet points, not full paragraphs.",
          prompt: "Deal details:\nProperty: {{steps.trigger.input.property_address}}\nBuyer: {{steps.trigger.input.buyer_name}}\nSale price: {{steps.trigger.input.sale_price}}\nClosing target: {{steps.trigger.input.closing_target}}\nContingencies: {{steps.trigger.input.contingencies}}\n\nExisting lease data:\n{{steps.leases.abstracts}}\n\nFirm DD policy (if available):\n{{steps.archive.context}}\n\nGenerate a complete due diligence checklist with:\n1. Title and survey items (with deadlines)\n2. Environmental (Phase I/II if needed)\n3. Physical inspection items\n4. Financial review (rent rolls, operating statements, tax returns)\n5. Lease review (existing tenants, estoppels, SNDAs)\n6. Zoning and permitting verification\n7. Insurance requirements\n\nInclude responsible party and deadline for each item. Format as a professional email body.",
          max_tokens: 4000,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Send DD checklist to broker",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Due diligence checklist -- {{steps.trigger.input.property_address}}",
          text: "{{steps.checklist.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "leases"),
    edge("leases", "archive"),
    edge("archive", "checklist"),
    edge("checklist", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 14 - Closing countdown (cron)
// ══════════════════════════════════════════════════════════════

const closingCountdownGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "Weekdays 8am ET",
        config: { cron: "0 8 * * 1-5", timezone: "America/New_York" },
      } },
    },
    {
      id: "offers", type: "query_offers", position: row(1),
      data: { step: {
        id: "offers", type: "query_offers", name: "Accepted offers approaching close",
        config: { filter: { status: "accepted" }, limit: 50 },
      } },
    },
    {
      id: "countdown", type: "openai", position: row(2),
      data: { step: {
        id: "countdown", type: "openai", name: "Build closing countdown",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a CRE transaction coordinator. Return JSON only.",
          prompt: "Today: {{steps.trigger.input.fired_at}}\n\nAccepted offers:\n{{steps.offers.offers}}\n\nFor each offer with a closing_target within the next 30 days, produce:\n- Days until closing\n- Outstanding items (earnest money verification, title commitment, survey, loan docs, closing statement)\n- Risk level (green/yellow/red based on days remaining vs typical CRE closing timeline)\n\nReturn [{ offer_id, property_address, buyer_name, closing_target, days_until_close, risk_level, outstanding_items: string[], next_action }]. Sort by days_until_close asc.",
          max_tokens: 1000,
        },
      } },
    },
    {
      id: "check", type: "condition", position: row(3),
      data: { step: {
        id: "check", type: "condition", name: "Any closings upcoming?",
        config: {
          expression: "{{steps.countdown.text}} contains \"offer_id\"",
          on_false: "stop",
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Send closing countdown",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Closing countdown -- deals approaching close",
          text: "Deals closing in the next 30 days:\n\n{{steps.countdown.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "offers"),
    edge("offers", "countdown"),
    edge("countdown", "check"),
    edge("check", "email", "true"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 15 - Market volatility landlord update (manual)
// ══════════════════════════════════════════════════════════════

const marketUpdateGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_manual", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_manual", name: "Broker triggers manually",
        config: {},
      } },
    },
    {
      id: "clients", type: "query_clients", position: row(1),
      data: { step: {
        id: "clients", type: "query_clients", name: "All landlord/investor contacts",
        config: { filter: {}, limit: 200 },
      } },
    },
    {
      id: "properties", type: "query_properties", position: row(2),
      data: { step: {
        id: "properties", type: "query_properties", name: "Managed properties",
        config: { filter: {}, limit: 200 },
      } },
    },
    {
      id: "firmView", type: "archive_lookup", position: row(3),
      data: { step: {
        id: "firmView", type: "archive_lookup", name: "Firm market outlook",
        config: {
          query: "Firm's current CRE market outlook, cap rate expectations, submarket trends, leasing velocity",
          k: 5, kind: "memo",
        },
      } },
    },
    {
      id: "compose", type: "openai", position: row(4),
      data: { step: {
        id: "compose", type: "openai", name: "Draft per-investor market update",
        config: {
          model: "claude-sonnet-4-6",
          system: "You write factual, non-speculative CRE market updates from a broker to their investor clients. Reference specific portfolio data. Cite firm memos by number where available.",
          prompt: "Context: {{steps.trigger.input.headline}}\n\nInvestor contacts:\n{{steps.clients.contacts}}\n\nProperties:\n{{steps.properties.properties}}\n\nFirm market outlook:\n{{steps.firmView.context}}\n\nFor each investor, draft a personalized market update that:\n1. Acknowledges the current market conditions\n2. References their specific properties and how they're positioned\n3. Provides the firm's outlook\n4. Notes any action items\n\nReturn JSON: [{ name, email, subject, body }].",
          max_tokens: 2000,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(5),
      data: { step: {
        id: "email", type: "send_email", name: "Send drafts for review",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Market update drafts -- ready for review",
          text: "{{steps.compose.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "clients"),
    edge("clients", "properties"),
    edge("properties", "firmView"),
    edge("firmView", "compose"),
    edge("compose", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 16 - Rent escalation tracker (cron)
// ══════════════════════════════════════════════════════════════

const rentEscalationGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "1st of each month",
        config: { cron: "0 8 1 * *", timezone: "America/New_York" },
      } },
    },
    {
      id: "leases", type: "lease_lookup", position: row(1),
      data: { step: {
        id: "leases", type: "lease_lookup", name: "All completed lease abstractions",
        config: { status: "completed", limit: 100 },
      } },
    },
    {
      id: "properties", type: "query_properties", position: row(2),
      data: { step: {
        id: "properties", type: "query_properties", name: "Properties with active leases",
        config: { filter: {}, limit: 200 },
      } },
    },
    {
      id: "escalations", type: "openai", position: row(3),
      data: { step: {
        id: "escalations", type: "openai", name: "Identify upcoming rent escalations",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a CRE lease administrator. Return JSON only.",
          prompt: "Today: {{steps.trigger.input.fired_at}}\n\nLease abstractions (contains escalation clauses, base rent, lease dates):\n{{steps.leases.abstracts}}\n\nProperties:\n{{steps.properties.properties}}\n\nIdentify leases with rent escalations due in the next 90 days. For each:\n- Calculate the new rent amount based on the escalation clause\n- Note the effective date\n- Flag if the escalation notice period hasn't been met yet\n\nReturn [{ property_address, tenant_name, current_rent, new_rent, escalation_type, effective_date, notice_required, notice_sent: false }].",
          max_tokens: 1200,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Send escalation report",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Rent escalations due -- next 90 days",
          text: "Upcoming rent escalations requiring notice or action:\n\n{{steps.escalations.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "leases"),
    edge("leases", "properties"),
    edge("properties", "escalations"),
    edge("escalations", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 17 - Vacancy marketing blast (manual)
// ══════════════════════════════════════════════════════════════

const vacancyMarketingGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_manual", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_manual", name: "Broker triggers manually",
        config: {},
      } },
    },
    {
      id: "properties", type: "query_properties", position: row(1),
      data: { step: {
        id: "properties", type: "query_properties", name: "Vacant / available properties",
        config: { filter: { transaction_stage: "listed" }, limit: 50 },
      } },
    },
    {
      id: "prospects", type: "query_clients", position: row(2),
      data: { step: {
        id: "prospects", type: "query_clients", name: "Active tenant prospects",
        config: { filter: {}, limit: 300 },
      } },
    },
    {
      id: "match", type: "openai", position: row(3),
      data: { step: {
        id: "match", type: "openai", name: "Match vacancies to tenant requirements",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a CRE leasing specialist. Match vacant spaces to tenant requirements. Return JSON only.",
          prompt: "Available properties:\n{{steps.properties.properties}}\n\nTenant prospects:\n{{steps.prospects.contacts}}\n\nFor each vacant property, identify matching prospects based on their requirements (size, price range, location, property type). Draft a personalized email for each match.\n\nReturn [{ property_address, property_type, prospect_name, prospect_email, match_score: 1-10, match_reason, email_subject, email_body }]. Sort by match_score desc.",
          max_tokens: 2000,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Send marketing drafts to broker",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Vacancy marketing -- matched prospects ready",
          text: "Matched prospects for your available properties:\n\n{{steps.match.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "properties"),
    edge("properties", "prospects"),
    edge("prospects", "match"),
    edge("match", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 18 - Post-close client retention (webhook)
// ══════════════════════════════════════════════════════════════

const postCloseRetentionGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_webhook", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_webhook", name: "Transaction closed webhook",
        config: {},
      } },
    },
    {
      id: "thank_you", type: "openai", position: row(1),
      data: { step: {
        id: "thank_you", type: "openai", name: "Draft thank-you + referral ask",
        config: {
          model: "claude-sonnet-4-6",
          system: "You write professional, warm thank-you notes from a CRE broker after a successful closing. Include a subtle referral ask. Under 150 words.",
          prompt: "Closing details:\nProperty: {{steps.trigger.input.property_address}}\nClient: {{steps.trigger.input.client_name}} ({{steps.trigger.input.client_email}})\nSide: {{steps.trigger.input.side}} (buyer/seller)\nSale price: {{steps.trigger.input.sale_price}}\n\nDraft:\n1. A personalized thank-you email referencing the specific deal\n2. A tasteful referral ask (do they know anyone else in the market?)\n3. An offer to keep them informed on market activity in their area\n\nReturn JSON: { subject, body }.",
          max_tokens: 500,
        },
      } },
    },
    {
      id: "email_draft", type: "send_email", position: row(2),
      data: { step: {
        id: "email_draft", type: "send_email", name: "Send draft to broker",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Thank-you draft ready -- {{steps.trigger.input.client_name}}",
          text: "Review and send to {{steps.trigger.input.client_name}} ({{steps.trigger.input.client_email}}):\n\n{{steps.thank_you.text}}",
        },
      } },
    },
    {
      id: "pause", type: "delay", position: row(3),
      data: { step: {
        id: "pause", type: "delay", name: "Pause 60s",
        config: { seconds: 60 },
      } },
    },
    {
      id: "reminder", type: "send_sms", position: row(4),
      data: { step: {
        id: "reminder", type: "send_sms", name: "Text broker to add to CRM drip",
        config: {
          to_role: "owner",
          body: "Deal closed: {{steps.trigger.input.property_address}} with {{steps.trigger.input.client_name}}. Don't forget to add them to your quarterly market update list.",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "thank_you"),
    edge("thank_you", "email_draft"),
    edge("email_draft", "pause"),
    edge("pause", "reminder"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 19 - Corridor void analysis report (cron)
//
// The flagship outbound intelligence workflow. Every week, the
// agent runs a void analysis along a configured corridor (2-8
// anchor points), scores parcels on zoning fit, acreage, vacancy,
// and value efficiency, then pulls full auditor + EPA detail on
// the top candidates. Delivers a ranked site report with citations.
// ══════════════════════════════════════════════════════════════

const corridorVoidAnalysisGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "Mondays 6am ET",
        config: { cron: "0 6 * * 1", timezone: "America/New_York" },
      } },
    },
    {
      id: "scan", type: "agent", position: row(1),
      data: { step: {
        id: "scan", type: "agent", name: "Run corridor void analysis",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a CRE site selection analyst. You run void analyses along commercial corridors to identify the best development sites. Always cite every data point with [ss:N] markers. Be specific about acreage, zoning, assessed values, and land use. When you find strong candidates, pull full detail on the top 5.",
          objective: "Run a directional void analysis along the corridor defined by these anchor points: {{secrets.corridor_anchors}}. Target use: {{secrets.target_use}}. Search for parcels that are {{secrets.target_zoning}}-zoned, {{secrets.acreage_min}}-{{secrets.acreage_max}} acres, prefer vacant land. Return the top 15 scored sites. Then for the top 5 scoring sites, pull full parcel detail including auditor records, tax estimates, and environmental (EPA brownfield) status. Compile everything into a ranked report.",
          tools: ["site_scan.void_analysis", "site_scan.detail", "memory.write"],
          max_steps: 12,
        },
      } },
    },
    {
      id: "synthesize", type: "openai", position: row(2),
      data: { step: {
        id: "synthesize", type: "openai", name: "Synthesize executive report",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a senior CRE analyst writing a weekly site intelligence brief for a development team. Write for decision-makers: lead with the best opportunity, explain why, include the numbers. Preserve all [ss:N] citation markers from the source data.",
          prompt: "Void analysis results and parcel detail:\n{{steps.scan.text}}\n\nWrite a weekly site intelligence brief:\n\n1. EXECUTIVE SUMMARY (3 sentences -- best opportunity this week and why)\n2. TOP 5 SITES (ranked table: address, acreage, zoning, assessed value, tax estimate, vacancy status, score, environmental flags)\n3. DEEP DIVE on #1 and #2 (full auditor data, demographics if available, development feasibility notes)\n4. SITES TO WATCH (any parcels that scored well but need more investigation)\n5. DATA GAPS (counties with no coverage, parcels where detail was unavailable)\n\nPreserve all citation markers. Format for email delivery.",
          max_tokens: 2500,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(3),
      data: { step: {
        id: "email", type: "send_email", name: "Deliver weekly site brief",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Site intelligence brief -- {{secrets.target_use}} corridor",
          text: "{{steps.synthesize.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "scan"),
    edge("scan", "synthesize"),
    edge("synthesize", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 20 - Development site prospector (cron)
//
// Broader than the corridor analysis. Searches multiple target
// areas for parcels matching development criteria, pulls detail,
// cross-references against existing pipeline to avoid duplicates,
// and delivers net-new opportunities.
// ══════════════════════════════════════════════════════════════

const developmentProspectorGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "Wednesdays 6am ET",
        config: { cron: "0 6 * * 3", timezone: "America/New_York" },
      } },
    },
    {
      id: "existing", type: "query_properties", position: row(1),
      data: { step: {
        id: "existing", type: "query_properties", name: "Current pipeline (to de-dupe)",
        config: { filter: {}, limit: 200 },
      } },
    },
    {
      id: "prospect", type: "agent", position: row(2),
      data: { step: {
        id: "prospect", type: "agent", name: "Search target areas for sites",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a CRE land acquisition analyst. Your job is to systematically search target markets for development-ready parcels. Search each target area, filter for the specified criteria, and pull detail on the most promising candidates. Always use [ss:N] citations. Flag any environmental concerns immediately.",
          objective: "Search these target areas for development sites: {{secrets.target_areas}}. Criteria: {{secrets.target_zoning}}-zoned, {{secrets.acreage_min}}-{{secrets.acreage_max}} acres, prefer vacant or underutilized land. For each area, search for matching parcels. Then pull full auditor detail and EPA status on the top 3 candidates per area. Cross-reference against properties already in our pipeline to avoid duplicates:\n\nExisting pipeline:\n{{steps.existing.properties}}\n\nOnly report NET NEW sites not already in our system.",
          tools: ["site_scan.search", "site_scan.detail", "memory.write"],
          max_steps: 18,
        },
      } },
    },
    {
      id: "score", type: "openai", position: row(3),
      data: { step: {
        id: "score", type: "openai", name: "Score and rank opportunities",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a CRE investment analyst. Score each site on a 1-10 scale across: location (proximity to demand drivers), size fit, zoning readiness, price efficiency (assessed value per acre), and environmental risk. Return a ranked table.",
          prompt: "Raw site data with parcel detail:\n{{steps.prospect.text}}\n\nFor each net-new site found:\n1. Score 1-10 on: Location, Size Fit, Zoning Readiness, Price Efficiency, Environmental Risk (10 = best)\n2. Calculate a composite score (weighted: Location 30%, Size 20%, Zoning 20%, Price 20%, Environmental 10%)\n3. Write a 2-sentence investment thesis for the top 3\n4. Flag any deal-breakers (contamination, zoning incompatibility, title concerns)\n\nReturn as a formatted report preserving all [ss:N] citations.",
          max_tokens: 2000,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Deliver prospecting report",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Development site prospector -- new opportunities found",
          text: "{{steps.score.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "existing"),
    edge("existing", "prospect"),
    edge("prospect", "score"),
    edge("score", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 21 - Acquisition target deep-dive (webhook)
//
// When a broker spots a property they're interested in (via
// webhook from the UI or an external source), this workflow
// runs the full intelligence stack: parcel search, auditor
// detail, tax estimate, census demographics, EPA brownfield,
// lease abstractions if we have any, and synthesizes it into
// an acquisition memo.
// ══════════════════════════════════════════════════════════════

const acquisitionDeepDiveGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_webhook", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_webhook", name: "Acquisition target webhook",
        config: {},
      } },
    },
    {
      id: "intel", type: "agent", position: row(1),
      data: { step: {
        id: "intel", type: "agent", name: "Full parcel intelligence",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a CRE acquisition analyst conducting due diligence on a potential acquisition target. Run every available intelligence tool: search to find the parcel, then pull full detail (auditor, tax, census, EPA). Be thorough -- this memo will inform a purchase decision. Always cite with [ss:N] markers.",
          objective: "Run full intelligence on: {{steps.trigger.input.address}}, {{steps.trigger.input.city}}, {{steps.trigger.input.state}}.\n\n1. Search for the parcel to get the parcel number and basic data\n2. Pull full detail: auditor records, tax estimate, census demographics, EPA brownfield status\n3. If the address is in a known corridor, note neighboring parcels and their zoning\n4. Save key findings to memory for future reference\n\nCompile all findings with full citations.",
          tools: ["site_scan.search", "site_scan.detail", "memory.write", "memory.search"],
          max_steps: 10,
        },
      } },
    },
    {
      id: "leases", type: "lease_lookup", position: row(2),
      data: { step: {
        id: "leases", type: "lease_lookup", name: "Check for existing lease data",
        config: { status: "completed", limit: 5 },
      } },
    },
    {
      id: "memo", type: "openai", position: row(3),
      data: { step: {
        id: "memo", type: "openai", name: "Draft acquisition memo",
        config: {
          model: "claude-sonnet-4-6",
          system: "You write professional CRE acquisition memos for investment committees. Lead with the thesis, support with data, flag risks prominently. Preserve all [ss:N] citation markers.",
          prompt: "Target: {{steps.trigger.input.address}}\nAsking price (if known): {{steps.trigger.input.asking_price}}\nProperty type: {{steps.trigger.input.property_type}}\nBroker notes: {{steps.trigger.input.notes}}\n\nParcel intelligence:\n{{steps.intel.text}}\n\nExisting lease data (if any):\n{{steps.leases.abstracts}}\n\nDraft an acquisition memo with these sections:\n\n1. INVESTMENT THESIS (3 sentences -- why this property, what's the opportunity)\n2. PROPERTY OVERVIEW (address, parcel #, acreage, zoning, year built, building SF)\n3. FINANCIAL SNAPSHOT (assessed value, tax estimate, asking price if known, implied cap rate if rental income is known)\n4. MARKET CONTEXT (census demographics -- population, median income, poverty rate)\n5. ENVIRONMENTAL STATUS (EPA findings, brownfield proximity)\n6. LEASE ANALYSIS (if lease data exists: term, rent, escalation, key clauses)\n7. RISKS AND CONCERNS (environmental, zoning incompatibility, structural, market)\n8. RECOMMENDED NEXT STEPS (site visit, Phase I, title search, broker meeting)\n\nFormat for email delivery. Preserve all citations.",
          max_tokens: 2500,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Deliver acquisition memo",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Acquisition memo -- {{steps.trigger.input.address}}",
          text: "{{steps.memo.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "intel"),
    edge("intel", "leases"),
    edge("leases", "memo"),
    edge("memo", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 22 - Multi-market void analysis (manual)
//
// The most complex template. Broker provides a thesis ("I want
// to find the best site for a 50,000 SF industrial distribution
// center within 30 miles of Columbus, OH"). The agent runs void
// analyses across multiple corridors, pulls detail on winners,
// cross-references environmental and tax data, and delivers a
// full site selection report with investment-grade analysis.
// ══════════════════════════════════════════════════════════════

const multiMarketVoidGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_manual", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_manual", name: "Broker triggers with thesis",
        config: { input_fields: [
          { name: "brief", label: "Client Brief", type: "textarea" as const, required: true, placeholder: "Describe the client's needs..." },
          { name: "target_use", label: "Target Use", type: "text" as const, required: true, placeholder: "e.g., Quick-service restaurant" },
          { name: "target_area", label: "Target Area", type: "text" as const, required: true, placeholder: "e.g., Northeast Ohio" },
          { name: "size_requirement", label: "Size Requirement", type: "text" as const, placeholder: "e.g., 2,000-5,000 SF" },
        ] },
      } },
    },
    {
      id: "void_scan", type: "agent", position: row(1),
      data: { step: {
        id: "void_scan", type: "agent", name: "Multi-corridor void analysis",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a senior CRE site selection consultant. You run systematic void analyses across multiple corridors to find the optimal development site for a client's specific use case. You must search at least 3 distinct corridors to ensure coverage. Pull full detail on every site that scores 4+ out of 7. Always use [ss:N] citations.",
          objective: "Client brief: {{steps.trigger.input.brief}}\nTarget use: {{steps.trigger.input.target_use}}\nTarget area: {{steps.trigger.input.target_area}}\nSize requirement: {{steps.trigger.input.size_requirement}}\nZoning: {{steps.trigger.input.zoning}}\nBudget: {{steps.trigger.input.budget}}\n\nRun void analyses along at least 3 corridors or submarkets within the target area. For each corridor, search for sites matching the criteria. Prefer vacant land. After all corridors are scanned, pull full auditor detail and EPA status on every site scoring 4+/7. Save the top 10 overall to memory.",
          tools: ["site_scan.void_analysis", "site_scan.detail", "memory.write"],
          max_steps: 20,
        },
      } },
    },
    {
      id: "competitive", type: "agent", position: row(2),
      data: { step: {
        id: "competitive", type: "agent", name: "Competitive landscape scan",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a CRE market analyst. Given a set of candidate sites, you analyze the competitive landscape around each: what's nearby, what's missing, what demand drivers exist. Search for parcels near each top candidate to understand the surrounding commercial ecosystem.",
          objective: "The void analysis identified these top sites:\n{{steps.void_scan.text}}\n\nFor the top 3 candidates, search the area within 2 miles for existing commercial properties to understand:\n1. What competing uses already exist nearby\n2. What anchor tenants or demand drivers are present\n3. Whether the area is saturated or underserved for the target use\n\nCompile a competitive landscape summary for each site.",
          tools: ["site_scan.search", "site_scan.detail"],
          max_steps: 12,
        },
      } },
    },
    {
      id: "report", type: "openai", position: row(3),
      data: { step: {
        id: "report", type: "openai", name: "Final site selection report",
        config: {
          model: "claude-sonnet-4-6",
          system: "You write investment-grade CRE site selection reports. This document will be presented to a development team or investment committee. Be rigorous, data-driven, and preserve every [ss:N] citation. Include tables where they add clarity.",
          prompt: "Client brief: {{steps.trigger.input.brief}}\n\nVoid analysis + parcel detail:\n{{steps.void_scan.text}}\n\nCompetitive landscape:\n{{steps.competitive.text}}\n\nWrite the final site selection report:\n\n1. ENGAGEMENT SUMMARY\n   - Client objective\n   - Search parameters\n   - Corridors analyzed\n   - Total parcels scanned\n\n2. RECOMMENDED SITE (detailed profile)\n   - Address, parcel #, acreage, zoning\n   - Auditor data (assessed value, last sale, year built)\n   - Tax estimate and any abatement opportunities\n   - Environmental status\n   - Competitive landscape\n   - Why this site wins\n\n3. RUNNER-UP SITES (top 5, table format)\n   - Rank, address, acreage, zoning, score, assessed value, key advantage, key risk\n\n4. MARKET CONTEXT\n   - Demographics around the recommended site\n   - Competitive density analysis\n   - Supply/demand observations\n\n5. RISK MATRIX\n   - Environmental, zoning, structural, market, and execution risks for the top 3\n\n6. NEXT STEPS\n   - Recommended actions for each shortlisted site\n\nPreserve all citations. Format for email delivery.",
          max_tokens: 3500,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Deliver site selection report",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Site selection report -- {{steps.trigger.input.target_use}} in {{steps.trigger.input.target_area}}",
          text: "{{steps.report.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "void_scan"),
    edge("void_scan", "competitive"),
    edge("competitive", "report"),
    edge("report", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 23 - Environmental risk scanner (manual)
//
// Given a target area, searches for all parcels and runs EPA
// brownfield checks on each. Produces a risk heat map showing
// which sites are clear vs contaminated. Critical for developers
// evaluating a new submarket.
// ══════════════════════════════════════════════════════════════

const environmentalScannerGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_manual", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_manual", name: "Broker triggers with area",
        config: { input_fields: [
          { name: "location", label: "Target Area", type: "text" as const, required: true, placeholder: "e.g., Euclid Ave corridor, Cleveland OH" },
          { name: "zoning", label: "Zoning Filter", type: "text" as const, placeholder: "e.g., C-2 Commercial" },
          { name: "acreage_min", label: "Min Acreage", type: "number" as const, placeholder: "1" },
          { name: "acreage_max", label: "Max Acreage", type: "number" as const, placeholder: "10" },
        ] },
      } },
    },
    {
      id: "scan", type: "agent", position: row(1),
      data: { step: {
        id: "scan", type: "agent", name: "Search area + EPA check each parcel",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are an environmental due diligence analyst for CRE. Search for parcels in the target area, then pull full detail on each to check EPA brownfield status. Flag any site with brownfield proximity, noting facility names and distances. Always cite with [ss:N] markers.",
          objective: "Search for parcels near: {{steps.trigger.input.location}}. Filter for: {{steps.trigger.input.zoning}} zoning, {{steps.trigger.input.acreage_min}}-{{steps.trigger.input.acreage_max}} acres. Then pull full detail on every result to check EPA brownfield/environmental status. Categorize each parcel as: CLEAR (no EPA facilities nearby), CAUTION (facilities nearby but not on-site), or FLAG (brownfield site or adjacent to one). Save findings to memory.",
          tools: ["site_scan.search", "site_scan.detail", "memory.write"],
          max_steps: 18,
        },
      } },
    },
    {
      id: "report", type: "openai", position: row(2),
      data: { step: {
        id: "report", type: "openai", name: "Environmental risk report",
        config: {
          model: "claude-sonnet-4-6",
          system: "You write environmental risk reports for CRE developers. Be factual, cite sources, and clearly categorize risk levels. This report will inform Phase I ESA decisions.",
          prompt: "Environmental scan results:\n{{steps.scan.text}}\n\nLocation: {{steps.trigger.input.location}}\n\nWrite an environmental risk report:\n\n1. AREA OVERVIEW (location, total parcels scanned, coverage gaps)\n\n2. RISK SUMMARY TABLE\n   | Address | Parcel # | Acreage | Status | EPA Facilities | Distance | Recommendation |\n   For each parcel, status = CLEAR / CAUTION / FLAG\n\n3. FLAGGED SITES (detailed writeup for each FLAG parcel)\n   - What EPA facility is nearby\n   - Facility type and status\n   - Distance from parcel boundary\n   - Whether Phase I ESA is recommended\n\n4. CLEAR SITES (list of parcels with no environmental concerns)\n\n5. RECOMMENDATION\n   - Which sites to proceed with\n   - Which to avoid\n   - Where Phase I is warranted\n\nPreserve all [ss:N] citations.",
          max_tokens: 2000,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(3),
      data: { step: {
        id: "email", type: "send_email", name: "Deliver environmental report",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Environmental risk scan -- {{steps.trigger.input.location}}",
          text: "{{steps.report.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "scan"),
    edge("scan", "report"),
    edge("report", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 24 - Saved parcel re-check (cron)
//
// Periodically re-runs detail on parcels the broker has saved
// to the workspace, checking for changes in ownership, assessed
// value, zoning, or environmental status. Surfaces anything that
// changed since last check.
// ══════════════════════════════════════════════════════════════

const parcelRecheckGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "1st of each month at 5am ET",
        config: { cron: "0 5 1 * *", timezone: "America/New_York" },
      } },
    },
    {
      id: "recheck", type: "agent", position: row(1),
      data: { step: {
        id: "recheck", type: "agent", name: "Re-check saved parcels for changes",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a CRE portfolio monitoring analyst. You re-check saved parcels for any changes since the last review. Compare fresh auditor data against what was previously cached. Flag ownership transfers, assessed value changes >10%, zoning amendments, and new EPA activity. Always cite with [ss:N] markers.",
          objective: "Search memory for previously saved parcel data. For each saved parcel, pull fresh detail from the county auditor. Compare against the cached version and flag any changes in: owner name, assessed value (>10% change), zoning class, land use designation, or new EPA brownfield activity. Compile a change report.",
          tools: ["memory.search", "site_scan.detail", "memory.write"],
          max_steps: 15,
        },
      } },
    },
    {
      id: "check", type: "condition", position: row(2),
      data: { step: {
        id: "check", type: "condition", name: "Any changes detected?",
        config: {
          expression: "{{steps.recheck.text}} contains \"change\"",
          on_false: "stop",
        },
      } },
    },
    {
      id: "report", type: "openai", position: row(3),
      data: { step: {
        id: "report", type: "openai", name: "Format change report",
        config: {
          model: "claude-sonnet-4-6",
          system: "You write concise parcel change alerts for CRE professionals. Lead with what changed and why it matters. Only report actual changes -- don't pad with unchanged parcels.",
          prompt: "Change detection results:\n{{steps.recheck.text}}\n\nFormat a change report:\n\n1. CHANGES DETECTED (table: parcel, address, what changed, old value, new value, significance)\n2. ACTION ITEMS (for each change, what should the broker do)\n3. NO CHANGES (count of parcels that were stable -- one line, no detail)\n\nPreserve all [ss:N] citations.",
          max_tokens: 1500,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Send change alert",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Parcel watch -- changes detected",
          text: "{{steps.report.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "recheck"),
    edge("recheck", "check"),
    edge("check", "report", "true"),
    edge("report", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 25 - Zoning change opportunity finder (cron)
//
// Searches target areas for parcels whose current zoning doesn't
// match the highest-and-best use for the area, indicating a
// potential rezone + development play. Cross-references assessed
// values to find undervalued land.
// ══════════════════════════════════════════════════════════════

const zoningOpportunityGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "Biweekly Fridays 6am ET",
        config: { cron: "0 6 */14 * 5", timezone: "America/New_York" },
      } },
    },
    {
      id: "scan", type: "agent", position: row(1),
      data: { step: {
        id: "scan", type: "agent", name: "Search for zoning mismatch parcels",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a CRE land use analyst specializing in entitlement plays. You look for parcels where the current zoning is lower-intensity than surrounding uses, indicating a rezone opportunity. Search for parcels in high-demand commercial corridors that are still zoned residential or agricultural. Always cite with [ss:N] markers.",
          objective: "Search these target areas: {{secrets.target_areas}}. For each area:\n1. Search for parcels zoned residential or agricultural that are 2+ acres\n2. Pull detail on each to check assessed value (looking for low value/acre indicating undeveloped land)\n3. Note surrounding zoning -- if neighbors are commercial/industrial but this parcel is residential, that's an opportunity\n4. Flag parcels where assessed_value/acreage is <50% of the area median (undervalued)\n\nSave opportunities to memory. Report all findings with citations.",
          tools: ["site_scan.search", "site_scan.detail", "memory.write"],
          max_steps: 15,
        },
      } },
    },
    {
      id: "analysis", type: "openai", position: row(2),
      data: { step: {
        id: "analysis", type: "openai", name: "Zoning opportunity analysis",
        config: {
          model: "claude-sonnet-4-6",
          system: "You write CRE land use opportunity briefs. Focus on the delta between current use/value and potential highest-and-best use. Include realistic rezone feasibility notes.",
          prompt: "Zoning mismatch scan results:\n{{steps.scan.text}}\n\nWrite an opportunity brief:\n\n1. OPPORTUNITIES TABLE\n   | Address | Current Zoning | Surrounding Zoning | Acreage | Assessed Value | Value/Acre | Opportunity Type |\n\n2. TOP 3 OPPORTUNITIES (detailed writeup)\n   - Current state and why it's underutilized\n   - What the surrounding area suggests about highest-and-best use\n   - Estimated value uplift if rezoned (rough, based on assessed values of comparable commercial parcels)\n   - Rezone feasibility (is it consistent with surrounding uses? political climate?)\n\n3. RISKS\n   - Environmental, title, political opposition, infrastructure gaps\n\nPreserve all [ss:N] citations.",
          max_tokens: 2000,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(3),
      data: { step: {
        id: "email", type: "send_email", name: "Deliver zoning opportunity brief",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Zoning opportunity finder -- rezone plays identified",
          text: "{{steps.analysis.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "scan"),
    edge("scan", "analysis"),
    edge("analysis", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 28 - Property due diligence report (manual)
// ══════════════════════════════════════════════════════════════

const propertyDueDiligenceGraph: WorkflowGraph = {
  nodes: [
    { id: "trigger", type: "trigger_manual", position: row(0), data: { step: { id: "trigger", type: "trigger_manual", name: "Manual trigger", config: { input_fields: [{ name: "address", label: "Property Address", type: "text" as const, required: true, placeholder: "1600 Euclid Ave, Cleveland, OH 44115" }] } } } },
    { id: "dd", type: "due_diligence", position: row(1), data: { step: { id: "dd", type: "due_diligence", name: "Due diligence", config: { address: "{{steps.trigger.input.address}}" } } } },
    { id: "analyze", type: "openai", position: row(2), data: { step: { id: "analyze", type: "openai", name: "Analyze results", config: { model: "gpt-4o-mini", system: "You are a CRE due diligence analyst. Summarize findings concisely, flag risks.", prompt: "Property at {{steps.trigger.input.address}}.\n\nCensus: {{steps.dd.census}}\nEmployment: {{steps.dd.employment}}\nFlood zone: {{steps.dd.flood_zone}}\nEPA: {{steps.dd.epa}}\n\nProvide a structured due diligence summary with risk flags.", max_tokens: 1200 } } } },
    { id: "report", type: "generate_document", position: row(3), data: { step: { id: "report", type: "generate_document", name: "Generate report", config: { title: "Due Diligence Report", subtitle: "{{steps.trigger.input.address}}", sections: [{ heading: "Summary", body: "{{steps.analyze.text}}" }, { heading: "Flood Zone", body: "Zone: {{steps.dd.flood_zone.flood_zone}} -- {{steps.dd.flood_zone.zone_description}}. SFHA: {{steps.dd.flood_zone.sfha}}" }] } } } },
  ],
  edges: [edge("trigger", "dd"), edge("dd", "analyze"), edge("analyze", "report")],
};

// ══════════════════════════════════════════════════════════════
// 29 - Lease expiry auto-alert (trigger_lease_expiry)
// ══════════════════════════════════════════════════════════════

const leaseExpiryAutoAlertGraph: WorkflowGraph = {
  nodes: [
    { id: "trigger", type: "trigger_lease_expiry", position: row(0), data: { step: { id: "trigger", type: "trigger_lease_expiry", name: "Lease expiry (90d)", config: { days_before: 90 } } } },
    { id: "notify", type: "for_each", position: row(1), data: { step: { id: "notify", type: "for_each", name: "Email each tenant", config: { items: "{{steps.trigger.input.properties}}", action_type: "send_email", action_config: { to: "{{item.tenant_email}}", subject: "Lease Expiry Notice -- {{item.property_name}}", text: "Your lease at {{item.property_name}} expires on {{item.expiration_date}}. Please contact us to discuss renewal options." } } } } },
  ],
  edges: [edge("trigger", "notify")],
};

// ══════════════════════════════════════════════════════════════
// 30 - Weekly pipeline digest (cron)
// ══════════════════════════════════════════════════════════════

const weeklyPipelineDigestGraph: WorkflowGraph = {
  nodes: [
    { id: "trigger", type: "trigger_cron", position: row(0), data: { step: { id: "trigger", type: "trigger_cron", name: "Monday 9am UTC", config: { cron: "0 9 * * 1" } } } },
    { id: "props", type: "query_properties", position: row(1), data: { step: { id: "props", type: "query_properties", name: "Active pipeline", config: { filter: {}, limit: 100 } } } },
    { id: "summarize", type: "openai", position: row(2), data: { step: { id: "summarize", type: "openai", name: "Summarize pipeline", config: { model: "gpt-4o-mini", system: "You are a CRE portfolio analyst. Write a concise weekly pipeline digest.", prompt: "Properties in pipeline:\n{{steps.props.properties}}\n\nWrite a brief pipeline digest grouped by stage. Highlight any deals stuck for over 14 days.", max_tokens: 1000 } } } },
    { id: "email", type: "send_email", position: row(3), data: { step: { id: "email", type: "send_email", name: "Send digest", config: { to: "{{secrets.team_email}}", subject: "Weekly Pipeline Digest", text: "{{steps.summarize.text}}" } } } },
  ],
  edges: [edge("trigger", "props"), edge("props", "summarize"), edge("summarize", "email")],
};

// ══════════════════════════════════════════════════════════════
// 31 - New listing analysis (manual + integration)
// ══════════════════════════════════════════════════════════════

const listingAnalysisGraph: WorkflowGraph = {
  nodes: [
    { id: "trigger", type: "trigger_manual", position: row(0), data: { step: { id: "trigger", type: "trigger_manual", name: "Manual trigger", config: { input_fields: [{ name: "address", label: "Property Address", type: "text" as const, required: true, placeholder: "123 Main St, City, ST 12345" }] } } } },
    { id: "ext", type: "integration_query", position: row(1), data: { step: { id: "ext", type: "integration_query", name: "Integration lookup", config: { provider: "costar", endpoint: "https://api.example.com/v1/search", method: "GET", params: { address: "{{steps.trigger.input.address}}" } } } } },
    { id: "dd", type: "due_diligence", position: row(2), data: { step: { id: "dd", type: "due_diligence", name: "Due diligence", config: { address: "{{steps.trigger.input.address}}" } } } },
    { id: "report", type: "generate_document", position: row(3), data: { step: { id: "report", type: "generate_document", name: "Generate report", config: { title: "Listing Analysis", subtitle: "{{steps.trigger.input.address}}", sections: [{ heading: "Market Data", body: "{{steps.ext.body}}" }, { heading: "Environmental & Demographics", body: "Census: {{steps.dd.census}}\nFlood: {{steps.dd.flood_zone}}\nEPA: {{steps.dd.epa}}" }] } } } },
  ],
  edges: [edge("trigger", "ext"), edge("ext", "dd"), edge("dd", "report")],
};

// ══════════════════════════════════════════════════════════════
// 32 - Deal stage notification (trigger_deal_stage)
// ══════════════════════════════════════════════════════════════

const dealStageNotificationGraph: WorkflowGraph = {
  nodes: [
    { id: "trigger", type: "trigger_deal_stage", position: row(0), data: { step: { id: "trigger", type: "trigger_deal_stage", name: "Deal -> Pending", config: { to_stage: "pending" } } } },
    { id: "contacts", type: "query_clients", position: row(1), data: { step: { id: "contacts", type: "query_clients", name: "Get contacts", config: { filter: {}, limit: 25 } } } },
    { id: "notify", type: "send_email", position: row(2), data: { step: { id: "notify", type: "send_email", name: "Notify team", config: { to: "{{secrets.team_email}}", subject: "Deal moved to Pending -- {{steps.trigger.input.address}}", text: "Property {{steps.trigger.input.address}} has moved from {{steps.trigger.input.from_stage}} to pending." } } } },
  ],
  edges: [edge("trigger", "contacts"), edge("contacts", "notify")],
};

// ══════════════════════════════════════════════════════════════
// 33 - Environmental risk screen with approval
// ══════════════════════════════════════════════════════════════

const environmentalRiskScreenGraph: WorkflowGraph = {
  nodes: [
    { id: "trigger", type: "trigger_manual", position: row(0), data: { step: { id: "trigger", type: "trigger_manual", name: "Manual trigger", config: { input_fields: [{ name: "address", label: "Property Address", type: "text" as const, required: true, placeholder: "123 Main St, City, ST 12345" }] } } } },
    { id: "dd", type: "due_diligence", position: row(1), data: { step: { id: "dd", type: "due_diligence", name: "Due diligence", config: { address: "{{steps.trigger.input.address}}" } } } },
    { id: "check_flood", type: "condition", position: row(2), data: { step: { id: "check_flood", type: "condition", name: "In flood zone?", config: { expression: "{{steps.dd.flood_zone.sfha}} == true", on_false: "continue" } } } },
    { id: "approve", type: "approval", position: { x: X + 260, y: 40 + 3 * 150 }, data: { step: { id: "approve", type: "approval", name: "Approve flood risk", config: { message: "Property is in a Special Flood Hazard Area ({{steps.dd.flood_zone.flood_zone}}). Proceed?", approver_role: "owner", timeout_hours: 48 } } } },
    { id: "notify", type: "send_email", position: row(4), data: { step: { id: "notify", type: "send_email", name: "Send results", config: { to: "{{secrets.team_email}}", subject: "Environmental Screen -- {{steps.trigger.input.address}}", text: "Flood zone: {{steps.dd.flood_zone.flood_zone}} ({{steps.dd.flood_zone.zone_description}})\nSFHA: {{steps.dd.flood_zone.sfha}}\nToxics: {{steps.dd.epa.toxics_facilities}}\nSuperfund: {{steps.dd.epa.superfund_sites}}" } } } },
  ],
  edges: [
    edge("trigger", "dd"),
    edge("dd", "check_flood"),
    edge("check_flood", "approve", "true"),
    edge("check_flood", "notify", "false"),
    edge("approve", "notify"),
  ],
};

// ══════════════════════════════════════════════════════════════
// Registry
// ══════════════════════════════════════════════════════════════

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    slug: "lease-expiration-outreach",
    name: "Lease expiration outreach",
    description: "Runs daily. Finds properties with leases expiring in the next 90 days, drafts outreach for each tenant, and sends a digest to the broker.",
    category: "Lease management",
    icon: "CalendarClock",
    accent: "flag",
    triggerLabel: "Daily at 9am ET",
    graph: leaseExpirationGraph,
  },
  {
    slug: "tenant-renewal-drip",
    name: "Tenant renewal drip sequence",
    description: "Weekly. Buckets expiring leases into 90/60/30-day cohorts and drafts escalating renewal communications for each tier.",
    category: "Lease management",
    icon: "Repeat",
    accent: "accent",
    triggerLabel: "Mondays 8am ET",
    graph: tenantRenewalDripGraph,
  },
  {
    slug: "new-listing-distribution",
    name: "New listing distribution",
    description: "When a property hits the market, matches it against active buyer/tenant requirements and drafts personalized blast emails.",
    category: "Prospecting",
    icon: "Send",
    accent: "verified",
    triggerLabel: "On new-listing webhook",
    graph: newListingDistributionGraph,
  },
  {
    slug: "deal-stage-nudge",
    name: "Deal pipeline stage nudge",
    description: "Every weekday morning, flags deals stuck in any pipeline stage too long -- showings without offers, stalled LOIs, overdue closings.",
    category: "Deal pipeline",
    icon: "AlertTriangle",
    accent: "flag",
    triggerLabel: "Weekdays 8:30am ET",
    graph: dealStageNudgeGraph,
  },
  {
    slug: "weekly-comp-survey",
    name: "Weekly comp survey",
    description: "Every Friday afternoon, compiles recent listing activity and closed deals into a professional comp report for the brokerage.",
    category: "Operations",
    icon: "BarChart3",
    accent: "ink",
    triggerLabel: "Fridays 4pm ET",
    graph: compSurveyGraph,
  },
  {
    slug: "tour-followup",
    name: "Property tour follow-up",
    description: "After a tour completes, drafts a personalized follow-up email citing property specifics and the prospect's feedback.",
    category: "Client communication",
    icon: "MapPin",
    accent: "verified",
    triggerLabel: "On tour-completed webhook",
    graph: tourFollowupGraph,
  },
  {
    slug: "stale-listing-alert",
    name: "Stale listing alert",
    description: "Every Wednesday, flags active listings that have been on market too long or are nearing expiration, with pricing adjustment recommendations.",
    category: "Operations",
    icon: "Clock",
    accent: "flag",
    triggerLabel: "Wednesdays 9am ET",
    graph: staleListingGraph,
  },
  {
    slug: "commission-tracking",
    name: "Commission pipeline tracker",
    description: "Weekly. Calculates expected commissions from pending deals, flags overdue closings, and projects monthly revenue.",
    category: "Operations",
    icon: "DollarSign",
    accent: "accent",
    triggerLabel: "Mondays 7am ET",
    graph: commissionTrackingGraph,
  },
  {
    slug: "coi-expiration",
    name: "COI expiration tracker",
    description: "Twice monthly, checks for tenant insurance certificates expiring in the next 60 days and drafts renewal notices.",
    category: "Lease management",
    icon: "ShieldCheck",
    accent: "flag",
    triggerLabel: "1st and 15th of each month",
    graph: coiExpirationGraph,
  },
  {
    slug: "investor-portfolio-report",
    name: "Investor portfolio report",
    description: "Monthly. Generates per-investor portfolio summaries covering occupancy, rent rolls, upcoming lease expirations, and vacancy exposure.",
    category: "Client communication",
    icon: "PieChart",
    accent: "ink",
    triggerLabel: "1st of each month",
    graph: investorReportGraph,
  },
  {
    slug: "lease-abstraction-alert",
    name: "Lease abstraction summary",
    description: "When a lease is abstracted, summarizes key terms, flags risks (below-market rent, missing escalation, onerous clauses), and emails the broker.",
    category: "Lease management",
    icon: "FileSearch",
    accent: "verified",
    triggerLabel: "On abstraction-complete webhook",
    graph: leaseAbstractionAlertGraph,
  },
  {
    slug: "prospect-reengagement",
    name: "Prospect re-engagement",
    description: "Weekly. Finds stale prospects who match current active listings and drafts re-engagement emails citing the specific property.",
    category: "Prospecting",
    icon: "UserPlus",
    accent: "accent",
    triggerLabel: "Tuesdays 9am ET",
    graph: prospectReengagementGraph,
  },
  {
    slug: "due-diligence-checklist",
    name: "Due diligence checklist",
    description: "When an offer is accepted, generates a complete DD checklist with deadlines, responsible parties, and items tailored to the deal.",
    category: "Deal pipeline",
    icon: "ClipboardCheck",
    accent: "verified",
    triggerLabel: "On offer-accepted webhook",
    requiresVault: true,
    graph: dueDiligenceGraph,
  },
  {
    slug: "closing-countdown",
    name: "Closing countdown",
    description: "Daily. Tracks all deals approaching close, flags outstanding items, and assigns risk levels based on timeline.",
    category: "Deal pipeline",
    icon: "Timer",
    accent: "flag",
    triggerLabel: "Weekdays 8am ET",
    graph: closingCountdownGraph,
  },
  {
    slug: "market-update",
    name: "Market update for investors",
    description: "Manual trigger. Drafts personalized market updates for each investor, referencing their specific portfolio and the firm's outlook.",
    category: "Client communication",
    icon: "TrendingUp",
    accent: "ink",
    triggerLabel: "Manual (one-click)",
    requiresVault: true,
    graph: marketUpdateGraph,
  },
  {
    slug: "rent-escalation-tracker",
    name: "Rent escalation tracker",
    description: "Monthly. Identifies leases with rent escalations due in the next 90 days, calculates new amounts, and flags overdue notices.",
    category: "Lease management",
    icon: "ArrowUpRight",
    accent: "accent",
    triggerLabel: "1st of each month",
    graph: rentEscalationGraph,
  },
  {
    slug: "vacancy-marketing",
    name: "Vacancy marketing blast",
    description: "Manual trigger. Matches vacant properties against all tenant prospects, scores each match, and drafts personalized outreach.",
    category: "Prospecting",
    icon: "Megaphone",
    accent: "verified",
    triggerLabel: "Manual (one-click)",
    graph: vacancyMarketingGraph,
  },
  {
    slug: "post-close-retention",
    name: "Post-close client retention",
    description: "After a deal closes, drafts a thank-you email with a referral ask and reminds the broker to add the client to ongoing market updates.",
    category: "Client communication",
    icon: "Heart",
    accent: "verified",
    triggerLabel: "On transaction-closed webhook",
    graph: postCloseRetentionGraph,
  },
  // ── Site intelligence ──
  {
    slug: "corridor-void-analysis",
    name: "Corridor void analysis",
    description: "Weekly. Runs a directional void analysis along a configured corridor, scores parcels on zoning/acreage/vacancy/value, pulls full auditor + EPA detail on top candidates, and delivers a ranked site intelligence brief.",
    category: "Site intelligence",
    icon: "Radar",
    accent: "accent",
    triggerLabel: "Mondays 6am ET",
    graph: corridorVoidAnalysisGraph,
  },
  {
    slug: "development-prospector",
    name: "Development site prospector",
    description: "Biweekly. Searches multiple target areas for parcels matching development criteria, pulls full detail, de-dupes against existing pipeline, scores on location/size/zoning/price/environmental risk.",
    category: "Site intelligence",
    icon: "Search",
    accent: "accent",
    triggerLabel: "Wednesdays 6am ET",
    graph: developmentProspectorGraph,
  },
  {
    slug: "acquisition-deep-dive",
    name: "Acquisition target deep-dive",
    description: "On demand. Given an address, runs the full intelligence stack -- parcel search, auditor records, tax estimate, census demographics, EPA brownfield, lease data -- and drafts an acquisition memo.",
    category: "Site intelligence",
    icon: "Microscope",
    accent: "verified",
    triggerLabel: "On acquisition-target webhook",
    graph: acquisitionDeepDiveGraph,
  },
  {
    slug: "multi-market-void-analysis",
    name: "Multi-market site selection",
    description: "Manual trigger. Broker provides a development thesis; Dante runs void analyses across 3+ corridors, scans competitive landscape around top candidates, and delivers an investment-grade site selection report.",
    category: "Site intelligence",
    icon: "Globe2",
    accent: "flag",
    triggerLabel: "Manual (one-click)",
    graph: multiMarketVoidGraph,
  },
  {
    slug: "environmental-scanner",
    name: "Environmental risk scanner",
    description: "Manual trigger. Searches a target area for all matching parcels, runs EPA brownfield checks on each, and categorizes every site as CLEAR, CAUTION, or FLAG with Phase I ESA recommendations.",
    category: "Site intelligence",
    icon: "Leaf",
    accent: "flag",
    triggerLabel: "Manual (one-click)",
    graph: environmentalScannerGraph,
  },
  {
    slug: "parcel-recheck",
    name: "Saved parcel re-check",
    description: "Monthly. Re-checks all saved parcels for changes in ownership, assessed value, zoning, or EPA status since last review. Only alerts when something actually changed.",
    category: "Site intelligence",
    icon: "RefreshCw",
    accent: "ink",
    triggerLabel: "1st of each month",
    graph: parcelRecheckGraph,
  },
  {
    slug: "zoning-opportunity-finder",
    name: "Zoning change opportunity finder",
    description: "Biweekly. Searches target areas for parcels zoned below surrounding uses -- residential lots in commercial corridors, agricultural land near industrial parks -- indicating rezone + development plays.",
    category: "Site intelligence",
    icon: "Layers",
    accent: "accent",
    triggerLabel: "Biweekly Fridays 6am ET",
    graph: zoningOpportunityGraph,
  },
  // ── Phase B templates (new step types) ──
  {
    slug: "property-due-diligence-report",
    name: "Property due diligence report",
    description: "Run Census, BLS, FEMA, and EPA checks on a property, analyze with AI, and generate a branded PDF report.",
    category: "Due diligence",
    icon: "ShieldCheck",
    accent: "accent",
    triggerLabel: "Manual",
    graph: propertyDueDiligenceGraph,
  },
  {
    slug: "lease-expiry-auto-alert",
    name: "Lease expiry auto-alert",
    description: "Fires daily when leases are within 90 days of expiration, emails each tenant contact automatically.",
    category: "Lease management",
    icon: "CalendarX2",
    accent: "verified",
    triggerLabel: "90 days before expiry",
    graph: leaseExpiryAutoAlertGraph,
  },
  {
    slug: "weekly-pipeline-digest",
    name: "Weekly pipeline digest",
    description: "Every Monday at 9am, query the full pipeline, generate an AI summary grouped by stage, and email the team.",
    category: "Deal pipeline",
    icon: "BarChart3",
    accent: "ink",
    triggerLabel: "Mondays 9am UTC",
    graph: weeklyPipelineDigestGraph,
  },
  {
    slug: "listing-analysis-with-integration",
    name: "New listing analysis",
    description: "Pull data from a connected integration, run due diligence, and generate a branded analysis report.",
    category: "Due diligence",
    icon: "FileText",
    accent: "accent",
    triggerLabel: "Manual",
    graph: listingAnalysisGraph,
  },
  {
    slug: "deal-stage-notification",
    name: "Deal stage notification",
    description: "When a property moves to a pending stage, automatically email the team with the deal details.",
    category: "Deal pipeline",
    icon: "ArrowRightLeft",
    accent: "verified",
    triggerLabel: "Stage change to pending",
    graph: dealStageNotificationGraph,
  },
  {
    slug: "environmental-risk-screen-with-approval",
    name: "Environmental risk screen with approval",
    description: "Run due diligence, flag flood zones, pause for owner approval if SFHA, then email the team.",
    category: "Risk management",
    icon: "AlertTriangle",
    accent: "flag",
    triggerLabel: "Manual",
    graph: environmentalRiskScreenGraph,
  },
];

export function getTemplate(slug: string): WorkflowTemplate | null {
  return WORKFLOW_TEMPLATES.find((t) => t.slug === slug) || null;
}

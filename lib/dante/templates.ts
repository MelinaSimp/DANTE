// lib/dante/templates.ts
//
// Pre-built workflow templates for building AI agents and workflows. Each
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
  category: "Pipeline" | "Document management" | "Client communication" | "Operations" | "Prospecting" | "Research" | "Due diligence" | "Risk management";
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
// 1 - Contract renewal outreach (cron)
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
        id: "properties", type: "query_properties", name: "Records with active contracts",
        config: { filter: {}, limit: 100 },
      } },
    },
    {
      id: "evaluate", type: "agent", position: row(2),
      data: { step: {
        id: "evaluate", type: "agent", name: "Filter expiring contracts + draft outreach",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are an operations assistant. Given a list of records with contract data, identify those with lease_end_date within the next 90 days. For each, compose a professional SMS and email draft notifying the customer and your team that the contract expiration is approaching and offering to discuss renewal options.",
          objective: "Review records from the previous step. Filter to those whose lease_end_date falls within the next 90 days from today. For each qualifying record, draft a personalized SMS for the customer and a summary for your team. Return the filtered list as JSON.",
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
        id: "notify", type: "send_email", name: "Email team digest",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Contract expirations approaching -- {{steps.evaluate.output.expiring.length}} records",
          text: "The following contracts expire within 90 days. Outreach drafts are ready for review:\n\n{{steps.evaluate.output.expiring}}",
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
// 2 - Customer renewal drip sequence (cron)
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
        id: "properties", type: "query_properties", name: "All records with contract dates",
        config: { filter: {}, limit: 200 },
      } },
    },
    {
      id: "leases", type: "lease_lookup", position: row(2),
      data: { step: {
        id: "leases", type: "lease_lookup", name: "Pull extracted contract terms",
        config: { status: "completed", limit: 100 },
      } },
    },
    {
      id: "triage", type: "openai", position: row(3),
      data: { step: {
        id: "triage", type: "openai", name: "Bucket into 90/60/30-day cohorts",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are an operations analyst. Return JSON only.",
          prompt: "Today's date: {{steps.trigger.input.fired_at}}\n\nRecords:\n{{steps.properties.properties}}\n\nContract extracts:\n{{steps.leases.abstracts}}\n\nFor each record with a contract ending within 90 days, assign it to a cohort: '90_day' (61-90 days out), '60_day' (31-60 days out), or '30_day' (1-30 days out). For each, draft an appropriate email: 90-day is a gentle heads-up about upcoming renewal, 60-day is a check-in asking about renewal intentions, 30-day is urgent action required. Return JSON: [{ property_id, address, tenant_name, cohort, days_remaining, email_subject, email_body }].",
          max_tokens: 2000,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Send renewal digest to your team",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Customer renewal pipeline -- weekly update",
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
// 3 - New record distribution (webhook)
// ══════════════════════════════════════════════════════════════

const newListingDistributionGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_webhook", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_webhook", name: "New record webhook",
        config: {},
      } },
    },
    {
      id: "buyers", type: "query_clients", position: row(1),
      data: { step: {
        id: "buyers", type: "query_clients", name: "Active contacts",
        config: { filter: {}, limit: 200 },
      } },
    },
    {
      id: "match", type: "openai", position: row(2),
      data: { step: {
        id: "match", type: "openai", name: "Match record to contact requirements",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a distribution specialist. Match a new record against contact requirements. Return JSON only.",
          prompt: "New record details:\nName: {{steps.trigger.input.address}}\nType: {{steps.trigger.input.property_type}}\nSize: {{steps.trigger.input.square_feet}}\nPrice: {{steps.trigger.input.asking_price}}\nRegion: {{steps.trigger.input.submarket}}\n\nActive contacts:\n{{steps.buyers.contacts}}\n\nReturn [{ contact_id, name, email, match_reason }] for every contact whose requirements (price_range, focus, location preferences) align with this record. Include a one-sentence match_reason explaining why.",
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
          system: "You draft professional, concise record announcement emails. Each email should reference why this record matches the recipient's known requirements. No fluff -- keep it brief.",
          prompt: "Record: {{steps.trigger.input.address}}, {{steps.trigger.input.property_type}}, {{steps.trigger.input.square_feet}} at {{steps.trigger.input.asking_price}}\n\nMatched contacts:\n{{steps.match.text}}\n\nFor each matched contact, draft a personalized email (subject + body). Return JSON: [{ contact_id, name, email, subject, body }].",
          max_tokens: 1500,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Send drafts to your team for review",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "New record blast ready -- {{steps.trigger.input.address}}",
          text: "Matched contacts and personalized email drafts for the new record:\n\n{{steps.blast.text}}",
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
// 6 - Meeting follow-up (webhook)
// ══════════════════════════════════════════════════════════════

const tourFollowupGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_webhook", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_webhook", name: "Meeting completed webhook",
        config: {},
      } },
    },
    {
      id: "leases", type: "lease_lookup", position: row(1),
      data: { step: {
        id: "leases", type: "lease_lookup", name: "Pull contract terms for record",
        config: { status: "completed", limit: 5 },
      } },
    },
    {
      id: "draft", type: "openai", position: row(2),
      data: { step: {
        id: "draft", type: "openai", name: "Draft meeting follow-up email",
        config: {
          model: "claude-sonnet-4-6",
          system: "You write professional, specific follow-up emails after a meeting. Reference concrete details from the meeting. Keep it under 200 words.",
          prompt: "Meeting details:\nRecord: {{steps.trigger.input.property_address}}\nAttendee: {{steps.trigger.input.attendee_name}} ({{steps.trigger.input.attendee_email}})\nRecap: {{steps.trigger.input.recap}}\nOutcome: {{steps.trigger.input.outcome}}\n\nContract terms (if available):\n{{steps.leases.abstracts}}\n\nDraft a follow-up email that:\n1. Thanks them for their time\n2. References specific points they liked or concerns they raised\n3. Includes a clear next-step CTA (schedule a follow-up, send a proposal, loop in the right contact)\n\nReturn JSON: { subject, body }.",
          max_tokens: 600,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(3),
      data: { step: {
        id: "email", type: "send_email", name: "Send to your team for review",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Meeting follow-up draft -- {{steps.trigger.input.property_address}}",
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
          system: "You are a compliance assistant. You review insurance documents and draft professional, firm but friendly renewal notices from your team to customers.",
          prompt: "Today: {{steps.trigger.input.fired_at}}\n\nInsurance / COI documents from the archive:\n{{steps.docs.context}}\n\nReview these documents for any certificates of insurance that are expiring within the next 60 days. For each expiring COI, draft a customer notice:\n- State the contract requirement for valid insurance\n- Note the current expiration date\n- Request updated certificate by 15 days before expiration\n\nIf no COIs are expiring soon, say so. Otherwise return the drafted notices.",
          max_tokens: 1200,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Send COI digest to your team",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "COI expirations -- customer notices drafted",
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
        id: "properties", type: "query_properties", name: "All managed records",
        config: { filter: {}, limit: 200 },
      } },
    },
    {
      id: "leases", type: "lease_lookup", position: row(2),
      data: { step: {
        id: "leases", type: "lease_lookup", name: "Current contract terms",
        config: { status: "completed", limit: 100 },
      } },
    },
    {
      id: "clients", type: "query_clients", position: row(3),
      data: { step: {
        id: "clients", type: "query_clients", name: "Client contacts",
        config: { filter: {}, limit: 100 },
      } },
    },
    {
      id: "report", type: "openai", position: row(4),
      data: { step: {
        id: "report", type: "openai", name: "Generate portfolio summary",
        config: {
          model: "claude-sonnet-4-6",
          system: "You produce professional monthly portfolio reports for clients. Use tables, keep it factual, include dollar figures.",
          prompt: "Month: {{steps.trigger.input.fired_at}}\n\nRecords under management:\n{{steps.properties.properties}}\n\nContract terms:\n{{steps.leases.abstracts}}\n\nClient contacts:\n{{steps.clients.contacts}}\n\nFor each client, produce a portfolio summary:\n1. Records they own (name, status, monthly value)\n2. Contract expirations upcoming in next 6 months\n3. Status and estimated value for open items\n4. Total monthly revenue across their portfolio\n\nReturn JSON: [{ investor_name, investor_email, report_body }].",
          max_tokens: 2000,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(5),
      data: { step: {
        id: "email", type: "send_email", name: "Send reports to your team for distribution",
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
// 11 - Document extraction completion alert (webhook)
// ══════════════════════════════════════════════════════════════

const leaseAbstractionAlertGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_webhook", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_webhook", name: "Document extraction webhook",
        config: {},
      } },
    },
    {
      id: "leases", type: "lease_lookup", position: row(1),
      data: { step: {
        id: "leases", type: "lease_lookup", name: "Fetch completed extraction",
        config: { status: "completed", limit: 1 },
      } },
    },
    {
      id: "summary", type: "openai", position: row(2),
      data: { step: {
        id: "summary", type: "openai", name: "Summarize key terms + flag risks",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a contract analyst. Summarize extracted contract terms clearly and flag any unusual clauses or risks (below-market pricing, missing escalation, short notice periods, onerous exclusivity clauses).",
          prompt: "Contract extraction result:\n{{steps.leases.abstracts}}\n\nRecord: {{steps.trigger.input.property_address}}\nContact: {{steps.trigger.input.tenant_name}}\n\nProduce:\n1. A one-paragraph executive summary of the key contract terms\n2. A table of the 10 most important terms (name, value)\n3. Risk flags -- any clauses that are unusual, counterparty-favorable, or missing\n\nFormat as a professional email body.",
          max_tokens: 1000,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(3),
      data: { step: {
        id: "email", type: "send_email", name: "Email contract summary to your team",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Contract extracted -- {{steps.trigger.input.property_address}}",
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
        id: "leases", type: "lease_lookup", name: "Existing contract extractions",
        config: { status: "completed", limit: 10 },
      } },
    },
    {
      id: "archive", type: "archive_lookup", position: row(2),
      data: { step: {
        id: "archive", type: "archive_lookup", name: "Your DD checklist template",
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
          system: "You produce thorough, actionable due diligence checklists for business transactions. Cite company policy where available. Include deadlines relative to the closing target. Be concise but complete — use bullet points, not full paragraphs.",
          prompt: "Project details:\nRecord: {{steps.trigger.input.property_address}}\nCounterparty: {{steps.trigger.input.buyer_name}}\nDeal value: {{steps.trigger.input.sale_price}}\nClosing target: {{steps.trigger.input.closing_target}}\nContingencies: {{steps.trigger.input.contingencies}}\n\nExisting contract data:\n{{steps.leases.abstracts}}\n\nYour DD policy (if available):\n{{steps.archive.context}}\n\nGenerate a complete due diligence checklist with:\n1. Documentation and records items (with deadlines)\n2. Compliance and regulatory review\n3. Operational inspection items\n4. Financial review (statements, tax returns, revenue data)\n5. Contract review (existing agreements, counterparties, obligations)\n6. Verification and permitting\n7. Insurance requirements\n\nInclude responsible party and deadline for each item. Format as a professional email body.",
          max_tokens: 4000,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Send DD checklist to your team",
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
// 15 - Market volatility client update (manual)
// ══════════════════════════════════════════════════════════════

const marketUpdateGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_manual", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_manual", name: "Trigger manually",
        config: {},
      } },
    },
    {
      id: "clients", type: "query_clients", position: row(1),
      data: { step: {
        id: "clients", type: "query_clients", name: "All client contacts",
        config: { filter: {}, limit: 200 },
      } },
    },
    {
      id: "properties", type: "query_properties", position: row(2),
      data: { step: {
        id: "properties", type: "query_properties", name: "Managed records",
        config: { filter: {}, limit: 200 },
      } },
    },
    {
      id: "firmView", type: "archive_lookup", position: row(3),
      data: { step: {
        id: "firmView", type: "archive_lookup", name: "Your market outlook",
        config: {
          query: "Your current market outlook, pricing expectations, segment trends, activity levels",
          k: 5, kind: "memo",
        },
      } },
    },
    {
      id: "compose", type: "openai", position: row(4),
      data: { step: {
        id: "compose", type: "openai", name: "Draft per-client market update",
        config: {
          model: "claude-sonnet-4-6",
          system: "You write factual, non-speculative market updates from your team to clients. Reference specific portfolio data. Cite company memos by number where available.",
          prompt: "Context: {{steps.trigger.input.headline}}\n\nClient contacts:\n{{steps.clients.contacts}}\n\nRecords:\n{{steps.properties.properties}}\n\nYour market outlook:\n{{steps.firmView.context}}\n\nFor each client, draft a personalized market update that:\n1. Acknowledges the current market conditions\n2. References their specific records and how they're positioned\n3. Provides your outlook\n4. Notes any action items\n\nReturn JSON: [{ name, email, subject, body }].",
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
// 16 - Price escalation tracker (cron)
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
        id: "leases", type: "lease_lookup", name: "All completed contract extractions",
        config: { status: "completed", limit: 100 },
      } },
    },
    {
      id: "properties", type: "query_properties", position: row(2),
      data: { step: {
        id: "properties", type: "query_properties", name: "Records with active contracts",
        config: { filter: {}, limit: 200 },
      } },
    },
    {
      id: "escalations", type: "openai", position: row(3),
      data: { step: {
        id: "escalations", type: "openai", name: "Identify upcoming price escalations",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a contract administrator. Return JSON only.",
          prompt: "Today: {{steps.trigger.input.fired_at}}\n\nContract extractions (contains escalation clauses, base price, contract dates):\n{{steps.leases.abstracts}}\n\nRecords:\n{{steps.properties.properties}}\n\nIdentify contracts with price escalations due in the next 90 days. For each:\n- Calculate the new price amount based on the escalation clause\n- Note the effective date\n- Flag if the escalation notice period hasn't been met yet\n\nReturn [{ property_address, tenant_name, current_rent, new_rent, escalation_type, effective_date, notice_required, notice_sent: false }].",
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
          subject: "Price escalations due -- next 90 days",
          text: "Upcoming price escalations requiring notice or action:\n\n{{steps.escalations.text}}",
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
// 17 - Availability marketing blast (manual)
// ══════════════════════════════════════════════════════════════

const vacancyMarketingGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_manual", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_manual", name: "Trigger manually",
        config: {},
      } },
    },
    {
      id: "properties", type: "query_properties", position: row(1),
      data: { step: {
        id: "properties", type: "query_properties", name: "Available records",
        config: { filter: { transaction_stage: "listed" }, limit: 50 },
      } },
    },
    {
      id: "prospects", type: "query_clients", position: row(2),
      data: { step: {
        id: "prospects", type: "query_clients", name: "Active prospects",
        config: { filter: {}, limit: 300 },
      } },
    },
    {
      id: "match", type: "openai", position: row(3),
      data: { step: {
        id: "match", type: "openai", name: "Match availability to prospect requirements",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are an outreach specialist. Match available records to prospect requirements. Return JSON only.",
          prompt: "Available records:\n{{steps.properties.properties}}\n\nProspects:\n{{steps.prospects.contacts}}\n\nFor each available record, identify matching prospects based on their requirements (size, price range, location, type). Draft a personalized email for each match.\n\nReturn [{ property_address, property_type, prospect_name, prospect_email, match_score: 1-10, match_reason, email_subject, email_body }]. Sort by match_score desc.",
          max_tokens: 2000,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Send marketing drafts to your team",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Availability marketing -- matched prospects ready",
          text: "Matched prospects for your available records:\n\n{{steps.match.text}}",
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
          system: "You write professional, warm thank-you notes after a successful closing. Include a subtle referral ask. Under 150 words.",
          prompt: "Closing details:\nRecord: {{steps.trigger.input.property_address}}\nClient: {{steps.trigger.input.client_name}} ({{steps.trigger.input.client_email}})\nSide: {{steps.trigger.input.side}} (buyer/seller)\nDeal value: {{steps.trigger.input.sale_price}}\n\nDraft:\n1. A personalized thank-you email referencing the specific deal\n2. A tasteful referral ask (do they know anyone else who could use your help?)\n3. An offer to keep them informed on relevant updates\n\nReturn JSON: { subject, body }.",
          max_tokens: 500,
        },
      } },
    },
    {
      id: "email_draft", type: "send_email", position: row(2),
      data: { step: {
        id: "email_draft", type: "send_email", name: "Send draft to your team",
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
        id: "reminder", type: "send_sms", name: "Text your team to add to follow-up list",
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
// 19 - Weekly research scan report (cron)
//
// The flagship outbound research workflow. Every week, the
// agent runs a research scan across a configured target area (2-8
// anchor points), scores candidates on fit, size, availability,
// and value efficiency, then pulls full source detail on
// the top candidates. Delivers a ranked research report with citations.
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
        id: "scan", type: "agent", name: "Run research scan",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a research analyst. Your job is to identify gaps in a target area -- which categories have no presence, which segments are underserved, and where opportunities exist. Always cite every data point with [ss:N] markers. Be specific with the numbers and details in the data. You may recommend options for confirmed gaps, but you MUST first call survey_area to verify the recommendation does not already exist within the target area. Never recommend something that is already present nearby.",
          objective: "Run a research scan across the area defined by these anchor points: {{secrets.corridor_anchors}}. Target focus: {{secrets.target_use}}. Filter results to {{secrets.target_zoning}} criteria, {{secrets.acreage_min}}-{{secrets.acreage_max}} range, prefer high-potential candidates. For each segment, report which categories are missing (the gaps) and which are already saturated. Return the top 15 scored candidates. Then for the top 5 candidates, pull full detail including source records, estimates, and status. Compile into a ranked report of gaps and top candidates.",
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
          system: "You are a senior analyst writing a weekly research brief for your team. Write for decision-makers: lead with the best opportunity, explain why, include the numbers. Preserve all [ss:N] citation markers from the source data.",
          prompt: "Research results and detail:\n{{steps.scan.text}}\n\nWrite a weekly research brief:\n\n1. EXECUTIVE SUMMARY (3 sentences -- best opportunity this week and why)\n2. TOP 5 CANDIDATES (ranked table: name, key metrics, estimated value, status, score, flags)\n3. DEEP DIVE on #1 and #2 (full source data, context if available, feasibility notes)\n4. CANDIDATES TO WATCH (any that scored well but need more investigation)\n5. DATA GAPS (areas with no coverage, candidates where detail was unavailable)\n\nPreserve all citation markers. Format for email delivery.",
          max_tokens: 2500,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(3),
      data: { step: {
        id: "email", type: "send_email", name: "Deliver weekly research brief",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Research brief -- {{secrets.target_use}}",
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

// On-demand research variant — catalog/editor preview only. The clone
// route resolves this slug to the hand-crafted n8n JSON in
// n8n-templates.ts (webhook trigger with the brief / search
// area / email form), so this graph just has to read faithfully.
const corridorVoidOnDemandGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_manual", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_manual", name: "Run research scan",
        config: { input_fields: [
          { name: "brief", label: "What are you looking for?", type: "textarea" as const, required: true, placeholder: "My client is looking for the best candidate for a new location in the target region. Prioritize high-potential options with strong fundamentals and no red flags." },
          { name: "corridor_anchors", label: "Search Area", type: "text" as const, required: true, placeholder: "The region or segment to research" },
          { name: "broker_email", label: "Send Results To (email)", type: "text" as const, required: true, placeholder: "you@yourcompany.com" },
        ] },
      } },
    },
    {
      id: "scan", type: "agent", position: row(1),
      data: { step: {
        id: "scan", type: "agent", name: "Run research scan",
        config: {
          model: "claude-sonnet-4-6",
          objective: "Run a research scan across the area described: {{steps.trigger.input.corridor_anchors}}. Brief: {{steps.trigger.input.brief}}. Identify missing categories per segment, score and rank matching candidates, pull full detail on the top 5 with source records, estimates, and status.",
          tools: ["site_scan.void_analysis", "site_scan.search", "site_scan.detail", "survey_area"],
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(2),
      data: { step: {
        id: "email", type: "send_email", name: "Email ranked research brief",
        config: { to: "{{steps.trigger.input.broker_email}}", subject: "Research brief -- research scan", text: "{{steps.scan.text}}" },
      } },
    },
  ],
  edges: [
    edge("trigger", "scan"),
    edge("scan", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 20 - Opportunity prospector (cron)
//
// Broader than the single-area scan. Searches multiple target
// areas for candidates matching criteria, pulls detail,
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
        id: "prospect", type: "agent", name: "Search target areas for candidates",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a research analyst. Your job is to systematically search target markets for promising candidates. Search each target area, filter for the specified criteria, and pull detail on the most promising candidates. Always use [ss:N] citations. Flag any concerns immediately.",
          objective: "Search these target areas for candidates: {{secrets.target_areas}}. Criteria: {{secrets.target_zoning}}, {{secrets.acreage_min}}-{{secrets.acreage_max}} range, prefer high-potential or underutilized candidates. For each area, search for matching candidates. Then pull full source detail and status on the top 3 candidates per area. Cross-reference against records already in our pipeline to avoid duplicates:\n\nExisting pipeline:\n{{steps.existing.properties}}\n\nOnly report NET NEW candidates not already in our system.",
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
          system: "You are an analyst. Score each candidate on a 1-10 scale across: location (proximity to demand drivers), size fit, readiness, price efficiency (value per unit), and risk. Return a ranked table.",
          prompt: "Raw data with full detail:\n{{steps.prospect.text}}\n\nFor each net-new candidate found:\n1. Score 1-10 on: Location, Size Fit, Readiness, Price Efficiency, Risk (10 = best)\n2. Calculate a composite score (weighted: Location 30%, Size 20%, Readiness 20%, Price 20%, Risk 10%)\n3. Write a 2-sentence thesis for the top 3\n4. Flag any deal-breakers (major concerns, incompatibility, red flags)\n\nReturn as a formatted report preserving all [ss:N] citations.",
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
          subject: "Opportunity prospector -- new opportunities found",
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
// 21 - Target deep-dive (webhook)
//
// When a team member spots a record they're interested in (via
// webhook from the UI or an external source), this workflow
// runs the full research stack: record search, source
// detail, estimates, demographics, status,
// contract extractions if we have any, and synthesizes it into
// a research memo.
// ══════════════════════════════════════════════════════════════

const acquisitionDeepDiveGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_webhook", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_webhook", name: "Target webhook",
        config: {},
      } },
    },
    {
      id: "intel", type: "agent", position: row(1),
      data: { step: {
        id: "intel", type: "agent", name: "Full record research",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a research analyst conducting due diligence on a potential target. Run every available research tool: search to find the record, then pull full detail (source records, estimates, demographics, status). Be thorough -- this memo will inform a decision. Always cite with [ss:N] markers.",
          objective: "Run full research on: {{steps.trigger.input.address}}, {{steps.trigger.input.city}}, {{steps.trigger.input.state}}.\n\n1. Search for the record to get its identifier and basic data\n2. Pull full detail: source records, estimates, demographics, status\n3. If the record is in a known segment, note neighboring records and their attributes\n4. Save key findings to memory for future reference\n\nCompile all findings with full citations.",
          tools: ["site_scan.search", "site_scan.detail", "memory.write", "memory.search"],
          max_steps: 10,
        },
      } },
    },
    {
      id: "leases", type: "lease_lookup", position: row(2),
      data: { step: {
        id: "leases", type: "lease_lookup", name: "Check for existing contract data",
        config: { status: "completed", limit: 5 },
      } },
    },
    {
      id: "memo", type: "openai", position: row(3),
      data: { step: {
        id: "memo", type: "openai", name: "Draft research memo",
        config: {
          model: "claude-sonnet-4-6",
          system: "You write professional research memos for decision-makers. Lead with the thesis, support with data, flag risks prominently. Preserve all [ss:N] citation markers.",
          prompt: "Target: {{steps.trigger.input.address}}\nPrice (if known): {{steps.trigger.input.asking_price}}\nType: {{steps.trigger.input.property_type}}\nNotes: {{steps.trigger.input.notes}}\n\nRecord research:\n{{steps.intel.text}}\n\nExisting contract data (if any):\n{{steps.leases.abstracts}}\n\nDraft a research memo with these sections:\n\n1. THESIS (3 sentences -- why this record, what's the opportunity)\n2. OVERVIEW (name, identifier, size, attributes, key facts)\n3. FINANCIAL SNAPSHOT (estimated value, cost estimate, price if known, implied return if revenue is known)\n4. CONTEXT (demographics -- population, median income, other indicators)\n5. STATUS (findings, risk indicators)\n6. CONTRACT ANALYSIS (if contract data exists: term, price, escalation, key clauses)\n7. RISKS AND CONCERNS (major concerns, incompatibility, structural, market)\n8. RECOMMENDED NEXT STEPS (site visit, deeper review, verification, follow-up meeting)\n\nFormat for email delivery. Preserve all citations.",
          max_tokens: 2500,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Deliver research memo",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Research memo -- {{steps.trigger.input.address}}",
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
// 22 - Multi-market research analysis (manual)
//
// The most complex template. The user provides a thesis ("I want
// to find the best option matching my criteria across a target
// region"). The agent runs research scans
// across multiple segments, pulls detail on winners,
// cross-references supporting data, and delivers a
// full selection report with rigorous analysis.
// ══════════════════════════════════════════════════════════════

const multiMarketVoidGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_manual", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_manual", name: "Trigger with thesis",
        config: { input_fields: [
          { name: "brief", label: "Client Brief", type: "textarea" as const, required: true, placeholder: "Describe the client's needs..." },
          { name: "target_use", label: "Target Use", type: "text" as const, required: true, placeholder: "e.g., New retail location" },
          { name: "target_area", label: "Target Area", type: "text" as const, required: true, placeholder: "e.g., Northeast Ohio" },
          { name: "size_requirement", label: "Size Requirement", type: "text" as const, placeholder: "e.g., mid-size" },
        ] },
      } },
    },
    {
      id: "void_scan", type: "agent", position: row(1),
      data: { step: {
        id: "void_scan", type: "agent", name: "Multi-segment research scan",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a senior research analyst. You run systematic research scans across multiple segments to identify market gaps and underserved areas. You must search at least 3 distinct segments to ensure coverage. For each segment, report which categories are missing and which are saturated. Pull full detail on every candidate that scores 4+ out of 7. You may recommend options for confirmed gaps, but you MUST first call survey_area to verify the recommendation does not already exist in the area. Always use [ss:N] citations.",
          objective: "Client brief: {{steps.trigger.input.brief}}\nTarget focus: {{steps.trigger.input.target_use}}\nTarget area: {{steps.trigger.input.target_area}}\nSize requirement: {{steps.trigger.input.size_requirement}}\nCriteria: {{steps.trigger.input.zoning}}\nBudget: {{steps.trigger.input.budget}}\n\nRun research scans across at least 3 segments within the target area. For each segment, identify which categories are MISSING (the gaps) and which are already saturated. Search for high-potential or underutilized candidates matching the criteria. After all segments are scanned, pull full source detail and status on every candidate scoring 4+/7. Save the top 10 overall to memory.",
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
          system: "You are a market analyst. Given a set of candidates, you analyze the competitive landscape around each: what's nearby, what's missing, what demand drivers exist. Search for records near each top candidate to understand the surrounding ecosystem.",
          objective: "The research scan identified these top candidates:\n{{steps.void_scan.text}}\n\nFor the top 3 candidates, search the surrounding area for existing options to understand:\n1. What competing options already exist nearby\n2. What anchors or demand drivers are present\n3. Whether the area is saturated or underserved for the target focus\n\nCompile a competitive landscape summary for each candidate.",
          tools: ["site_scan.search", "site_scan.detail"],
          max_steps: 12,
        },
      } },
    },
    {
      id: "report", type: "openai", position: row(3),
      data: { step: {
        id: "report", type: "openai", name: "Final selection report",
        config: {
          model: "claude-sonnet-4-6",
          system: "You write rigorous selection reports. This document will be presented to your team or decision-makers. Be rigorous, data-driven, and preserve every [ss:N] citation. Include tables where they add clarity.",
          prompt: "Client brief: {{steps.trigger.input.brief}}\n\nResearch scan + full detail:\n{{steps.void_scan.text}}\n\nCompetitive landscape:\n{{steps.competitive.text}}\n\nWrite the final selection report:\n\n1. ENGAGEMENT SUMMARY\n   - Client objective\n   - Search parameters\n   - Segments analyzed\n   - Total candidates scanned\n\n2. RECOMMENDED OPTION (detailed profile)\n   - Name, identifier, size, attributes\n   - Source data (estimated value, last activity, key facts)\n   - Cost estimate and any savings opportunities\n   - Status\n   - Competitive landscape\n   - Why this option wins\n\n3. RUNNER-UP OPTIONS (top 5, table format)\n   - Rank, name, size, attributes, score, estimated value, key advantage, key risk\n\n4. MARKET CONTEXT\n   - Demographics around the recommended option\n   - Competitive density analysis\n   - Supply/demand observations\n\n5. RISK MATRIX\n   - Compliance, structural, market, and execution risks for the top 3\n\n6. NEXT STEPS\n   - Recommended actions for each shortlisted option\n\nPreserve all citations. Format for email delivery.",
          max_tokens: 3500,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Deliver selection report",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Selection report -- {{steps.trigger.input.target_use}} in {{steps.trigger.input.target_area}}",
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
// 23 - Risk scanner (manual)
//
// Given a target area, searches for all candidates and runs
// risk checks on each. Produces a risk heat map showing
// which candidates are clear vs flagged. Critical for teams
// evaluating a new area.
// ══════════════════════════════════════════════════════════════

const environmentalScannerGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_manual", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_manual", name: "Trigger with area",
        config: { input_fields: [
          { name: "location", label: "Target Area", type: "text" as const, required: true, placeholder: "e.g., a target region or segment" },
          { name: "zoning", label: "Criteria Filter", type: "text" as const, placeholder: "e.g., a category filter" },
          { name: "acreage_min", label: "Min Size", type: "number" as const, placeholder: "1" },
          { name: "acreage_max", label: "Max Size", type: "number" as const, placeholder: "10" },
        ] },
      } },
    },
    {
      id: "scan", type: "agent", position: row(1),
      data: { step: {
        id: "scan", type: "agent", name: "Search area + risk check each candidate",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a risk analyst. Search for candidates in the target area, then pull full detail on each to check risk status. Flag any candidate with risk indicators, noting the specifics and severity. Always cite with [ss:N] markers.",
          objective: "Search for candidates near: {{steps.trigger.input.location}}. Filter for: {{steps.trigger.input.zoning}} criteria, {{steps.trigger.input.acreage_min}}-{{steps.trigger.input.acreage_max}} size. Then pull full detail on every result to check risk status. Categorize each candidate as: CLEAR (no risk indicators nearby), CAUTION (indicators nearby but not directly affecting), or FLAG (flagged candidate or adjacent to one). Save findings to memory.",
          tools: ["site_scan.search", "site_scan.detail", "memory.write"],
          max_steps: 18,
        },
      } },
    },
    {
      id: "report", type: "openai", position: row(2),
      data: { step: {
        id: "report", type: "openai", name: "Risk report",
        config: {
          model: "claude-sonnet-4-6",
          system: "You write risk reports for teams. Be factual, cite sources, and clearly categorize risk levels. This report will inform deeper review decisions.",
          prompt: "Risk scan results:\n{{steps.scan.text}}\n\nLocation: {{steps.trigger.input.location}}\n\nWrite a risk report:\n\n1. AREA OVERVIEW (location, total candidates scanned, coverage gaps)\n\n2. RISK SUMMARY TABLE\n   | Name | Identifier | Size | Status | Risk Indicators | Severity | Recommendation |\n   For each candidate, status = CLEAR / CAUTION / FLAG\n\n3. FLAGGED CANDIDATES (detailed writeup for each FLAG candidate)\n   - What risk indicator is present\n   - Indicator type and status\n   - Severity\n   - Whether deeper review is recommended\n\n4. CLEAR CANDIDATES (list of candidates with no concerns)\n\n5. RECOMMENDATION\n   - Which candidates to proceed with\n   - Which to avoid\n   - Where deeper review is warranted\n\nPreserve all [ss:N] citations.",
          max_tokens: 2000,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(3),
      data: { step: {
        id: "email", type: "send_email", name: "Deliver risk report",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Risk scan -- {{steps.trigger.input.location}}",
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
// 24 - Saved record re-check (cron)
//
// Periodically re-runs detail on records the team has saved
// to the workspace, checking for changes in ownership, estimated
// value, attributes, or status. Surfaces anything that
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
        id: "recheck", type: "agent", name: "Re-check saved records for changes",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a monitoring analyst. You re-check saved records for any changes since the last review. Compare fresh source data against what was previously cached. Flag ownership transfers, estimated value changes >10%, attribute amendments, and new activity. Always cite with [ss:N] markers.",
          objective: "Search memory for previously saved record data. For each saved record, pull fresh detail from the source. Compare against the cached version and flag any changes in: owner name, estimated value (>10% change), category, designation, or new activity. Compile a change report.",
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
          system: "You write concise change alerts for teams. Lead with what changed and why it matters. Only report actual changes -- don't pad with unchanged records.",
          prompt: "Change detection results:\n{{steps.recheck.text}}\n\nFormat a change report:\n\n1. CHANGES DETECTED (table: record, name, what changed, old value, new value, significance)\n2. ACTION ITEMS (for each change, what should the team do)\n3. NO CHANGES (count of records that were stable -- one line, no detail)\n\nPreserve all [ss:N] citations.",
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
          subject: "Record watch -- changes detected",
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
// 25 - Undervalued opportunity finder (cron)
//
// Searches target areas for candidates whose current profile doesn't
// match the best potential use for the area, indicating a
// potential upside play. Cross-references estimated
// values to find undervalued candidates.
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
        id: "scan", type: "agent", name: "Search for undervalued candidates",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a research analyst specializing in upside plays. You look for candidates where the current profile is lower-value than surrounding options, indicating an opportunity. Search for candidates in high-demand segments that are still underdeveloped. Always cite with [ss:N] markers.",
          objective: "Search these target areas: {{secrets.target_areas}}. For each area:\n1. Search for underdeveloped candidates that are above a minimum size\n2. Pull detail on each to check estimated value (looking for low value per unit indicating untapped potential)\n3. Note surrounding options -- if neighbors are higher-value but this candidate is not, that's an opportunity\n4. Flag candidates where estimated value per unit is <50% of the area median (undervalued)\n\nSave opportunities to memory. Report all findings with citations.",
          tools: ["site_scan.search", "site_scan.detail", "memory.write"],
          max_steps: 15,
        },
      } },
    },
    {
      id: "analysis", type: "openai", position: row(2),
      data: { step: {
        id: "analysis", type: "openai", name: "Opportunity analysis",
        config: {
          model: "claude-sonnet-4-6",
          system: "You write opportunity briefs. Focus on the delta between current value and potential best use. Include realistic feasibility notes.",
          prompt: "Undervalued scan results:\n{{steps.scan.text}}\n\nWrite an opportunity brief:\n\n1. OPPORTUNITIES TABLE\n   | Name | Current Profile | Surrounding Profile | Size | Estimated Value | Value/Unit | Opportunity Type |\n\n2. TOP 3 OPPORTUNITIES (detailed writeup)\n   - Current state and why it's underutilized\n   - What the surrounding area suggests about best use\n   - Estimated value uplift if repositioned (rough, based on values of comparable options)\n   - Feasibility (is it consistent with surrounding options? conditions?)\n\n3. RISKS\n   - Compliance, ownership, opposition, resource gaps\n\nPreserve all [ss:N] citations.",
          max_tokens: 2000,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(3),
      data: { step: {
        id: "email", type: "send_email", name: "Deliver opportunity brief",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Undervalued opportunity finder -- upside plays identified",
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



// ══════════════════════════════════════════════════════════════
// 29 - Contract expiry auto-alert (trigger_lease_expiry)
// ══════════════════════════════════════════════════════════════

const leaseExpiryAutoAlertGraph: WorkflowGraph = {
  nodes: [
    { id: "trigger", type: "trigger_lease_expiry", position: row(0), data: { step: { id: "trigger", type: "trigger_lease_expiry", name: "Contract expiry (90d)", config: { days_before: 90 } } } },
    { id: "notify", type: "for_each", position: row(1), data: { step: { id: "notify", type: "for_each", name: "Email each contact", config: { items: "{{steps.trigger.input.properties}}", action_type: "send_email", action_config: { to: "{{item.tenant_email}}", subject: "Contract Expiry Notice -- {{item.property_name}}", text: "Your contract for {{item.property_name}} expires on {{item.expiration_date}}. Please contact us to discuss renewal options." } } } } },
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
    { id: "summarize", type: "openai", position: row(2), data: { step: { id: "summarize", type: "openai", name: "Summarize pipeline", config: { model: "gpt-4o-mini", system: "You are a portfolio analyst. Write a concise weekly pipeline digest.", prompt: "Records in pipeline:\n{{steps.props.properties}}\n\nWrite a brief pipeline digest grouped by stage. Highlight any deals stuck for over 14 days.", max_tokens: 1000 } } } },
    { id: "email", type: "send_email", position: row(3), data: { step: { id: "email", type: "send_email", name: "Send digest", config: { to: "{{secrets.team_email}}", subject: "Weekly Pipeline Digest", text: "{{steps.summarize.text}}" } } } },
  ],
  edges: [edge("trigger", "props"), edge("props", "summarize"), edge("summarize", "email")],
};



// ══════════════════════════════════════════════════════════════
// 32 - Deal stage notification (trigger_deal_stage)
// ══════════════════════════════════════════════════════════════

const dealStageNotificationGraph: WorkflowGraph = {
  nodes: [
    { id: "trigger", type: "trigger_deal_stage", position: row(0), data: { step: { id: "trigger", type: "trigger_deal_stage", name: "Deal -> Pending", config: { to_stage: "pending" } } } },
    { id: "contacts", type: "query_clients", position: row(1), data: { step: { id: "contacts", type: "query_clients", name: "Get contacts", config: { filter: {}, limit: 25 } } } },
    { id: "notify", type: "send_email", position: row(2), data: { step: { id: "notify", type: "send_email", name: "Notify team", config: { to: "{{secrets.team_email}}", subject: "Deal moved to Pending -- {{steps.trigger.input.address}}", text: "Record {{steps.trigger.input.address}} has moved from {{steps.trigger.input.from_stage}} to pending." } } } },
  ],
  edges: [edge("trigger", "contacts"), edge("contacts", "notify")],
};



// ══════════════════════════════════════════════════════════════
// 31 - Deal score analysis (manual)
// ══════════════════════════════════════════════════════════════

const dealScoreUnderwritingGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_manual", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_manual", name: "Start analysis",
        config: {
          input_fields: [
            { name: "property_address", type: "text", label: "Property address", required: true },
            { name: "asking_price", type: "number", label: "Asking price ($)", required: true },
            { name: "gross_rent", type: "number", label: "Gross annual rent ($)", required: true },
            { name: "operating_expenses", type: "number", label: "Operating expenses ($)", required: true },
            { name: "vacancy_rate", type: "number", label: "Vacancy rate (decimal, e.g. 0.05)", required: false },
            { name: "loan_amount", type: "number", label: "Loan amount ($)", required: false },
            { name: "interest_rate", type: "number", label: "Interest rate (decimal)", required: false },
            { name: "amortization_years", type: "number", label: "Amortization (years)", required: false },
            { name: "equity", type: "number", label: "Total cash invested ($)", required: false },
          ],
        },
      } },
    },
    {
      id: "calc_noi", type: "code", position: row(1),
      data: { step: {
        id: "calc_noi", type: "code", name: "Build calculator inputs",
        config: {
          language: "javascript",
          code: [
            "const inp = steps.trigger.input;",
            "const vacancy = inp.vacancy_rate || 0.05;",
            "const inputs = {",
            "  gross_potential_rent: inp.gross_rent,",
            "  vacancy_rate: vacancy,",
            "  operating_expenses: inp.operating_expenses,",
            "  purchase_price: inp.asking_price,",
            "  noi: inp.gross_rent * (1 - vacancy) - inp.operating_expenses,",
            "};",
            "if (inp.loan_amount) inputs.loan_amount = inp.loan_amount;",
            "if (inp.interest_rate) inputs.interest_rate = inp.interest_rate;",
            "if (inp.amortization_years) inputs.amortization_years = inp.amortization_years;",
            "if (inp.equity) inputs.total_cash_invested = inp.equity;",
            "if (inp.loan_amount && inp.interest_rate && inp.amortization_years) {",
            "  const r = inp.interest_rate / 12;",
            "  const n = inp.amortization_years * 12;",
            "  const pmt = inp.loan_amount * (r * Math.pow(1+r, n)) / (Math.pow(1+r, n) - 1);",
            "  inputs.annual_debt_service = Math.round(pmt * 12);",
            "}",
            "return { inputs, address: inp.property_address };",
          ].join("\n"),
        },
      } },
    },
    {
      id: "run_calc", type: "agent", position: row(2),
      data: { step: {
        id: "run_calc", type: "agent", name: "Run analysis battery",
        config: {
          model: "claude-sonnet-4-6",
          system:
            "You are a financial analyst. Use the cre.calculate tool to run a complete " +
            "financial analysis. Request all applicable metrics in a single call: noi, cap_rate, " +
            "cash_on_cash, dscr, ltv, debt_yield, opex_ratio, break_even_occupancy, price_per_sf, " +
            "debt_service, deal_score. Interpret every result with context. Flag any concerning metrics.",
          objective:
            "Use the numeric inputs from the previous step to run a full financial analysis battery. " +
            "Call the cre_calculate tool with all applicable metrics. Then interpret each result, " +
            "noting whether values are strong, acceptable, or concerning for a typical acquisition. " +
            "Pay special attention to the deal_score composite and flag any dimension that grades D or F.",
          tools: ["cre.calculate"],
          max_steps: 4,
        },
      } },
    },
    {
      id: "report", type: "generate_document", position: row(3),
      data: { step: {
        id: "report", type: "generate_document", name: "Generate analysis report",
        config: {
          title: "Deal Analysis Report",
          subtitle: "{{steps.calc_noi.output.address}}",
          sections: [
            { heading: "Executive Summary", body: "{{steps.run_calc.output}}" },
            { heading: "Financial Inputs", body: "{{steps.calc_noi.output}}" },
          ],
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "calc_noi"),
    edge("calc_noi", "run_calc"),
    edge("run_calc", "report"),
  ],
};

// ══════════════════════════════════════════════════════════════
// Registry
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// Single-step tools, exposed as manual-trigger workflows.
// Each was formerly a standalone page; a user now runs them from
// the Workflows catalog. They wrap the matching Drift n8n node.
// ══════════════════════════════════════════════════════════════

const marketCompsGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_manual", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_manual", name: "Run comparables lookup",
        config: { input_fields: [
          { name: "property_type", label: "Record Type", type: "text" as const, placeholder: "Retail (blank = all types)" },
        ] },
      } },
    },
    {
      id: "comps", type: "market_comps", position: row(1),
      data: { step: {
        id: "comps", type: "market_comps", name: "Look up comparables",
        config: { property_type: "{{steps.trigger.input.property_type}}", limit: 50 },
      } },
    },
  ],
  edges: [edge("trigger", "comps")],
};

const underwriteGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_manual", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_manual", name: "Submit a spreadsheet",
        config: { input_fields: [
          { name: "vault_item_id", label: "Spreadsheet (vault item ID)", type: "text" as const, required: true, placeholder: "Vault item ID of the spreadsheet" },
          { name: "purchase_price", label: "Purchase Price (optional)", type: "number" as const, placeholder: "e.g. 4250000" },
        ] },
      } },
    },
    {
      id: "model", type: "underwrite", position: row(1),
      data: { step: {
        id: "model", type: "underwrite", name: "Run DCF analysis",
        config: { vault_item_id: "{{steps.trigger.input.vault_item_id}}", purchase_price: "{{steps.trigger.input.purchase_price}}" },
      } },
    },
  ],
  edges: [edge("trigger", "model")],
};

const leaseAbstractGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_manual", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_manual", name: "Submit a document",
        config: { input_fields: [
          { name: "vault_item_id", label: "Document (vault item ID)", type: "text" as const, required: true, placeholder: "Vault item ID of the document" },
        ] },
      } },
    },
    {
      id: "abstract", type: "lease_abstract", position: row(1),
      data: { step: {
        id: "abstract", type: "lease_abstract", name: "Extract document terms",
        config: { vault_item_id: "{{steps.trigger.input.vault_item_id}}" },
      } },
    },
  ],
  edges: [edge("trigger", "abstract")],
};

// ══════════════════════════════════════════════════════════════
// 26 - AI agent: research brief (manual)
//
// Demonstrates the Approach-B agent pattern from the design: an Agent
// node with a Chat Model, Memory, and a Tool wired into its bottom
// sub-ports. The converter folds the sub-nodes into the single agent
// at run time (n8n-converter.ts), so this both renders the agent-with-
// lanes layout AND executes.
// ══════════════════════════════════════════════════════════════

const agentCorridorBriefGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_manual", position: { x: 40, y: 300 },
      data: { step: {
        id: "trigger", type: "trigger_manual", name: "Run manually", config: {},
      } },
    },
    {
      id: "agent", type: "agent", position: { x: 380, y: 280 },
      data: { step: {
        id: "agent", type: "agent", name: "Research scan",
        config: {
          model: "claude-sonnet-4-6",
          system: "You are a research analyst. Identify what is missing from a target area -- underserved categories, high-potential or underutilized candidates -- and cite every data point with [ss:N] markers.",
          objective: "Run a research scan across the area defined by {{secrets.corridor_anchors}}. Report the missing categories and the top candidates, then summarize the findings for your team.",
          tools: [],
          max_steps: 10,
        },
      } },
    },
    {
      id: "chat_model", type: "chat_model", position: { x: 150, y: 540 },
      data: { step: {
        id: "chat_model", type: "chat_model", name: "Claude Sonnet 4.6",
        config: { model: "claude-sonnet-4-6" },
      } },
    },
    {
      id: "memory", type: "agent_memory", position: { x: 390, y: 540 },
      data: { step: {
        id: "memory", type: "agent_memory", name: "Conversation memory",
        config: { kind: "conversation" },
      } },
    },
    {
      id: "tool", type: "agent_tool", position: { x: 630, y: 540 },
      data: { step: {
        id: "tool", type: "agent_tool", name: "Research tool",
        config: { tool: "site_scan.void_analysis" },
      } },
    },
    {
      id: "email", type: "send_email", position: { x: 770, y: 290 },
      data: { step: {
        id: "email", type: "send_email", name: "Email the brief",
        config: {
          to: "{{secrets.broker_email}}",
          subject: "Research scan brief",
          text: "{{steps.agent.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "agent"),
    edge("agent", "email"),
    { id: "chat_model->agent", source: "chat_model", target: "agent", connectionType: "ai_model" },
    { id: "memory->agent", source: "memory", target: "agent", connectionType: "ai_memory" },
    { id: "tool->agent", source: "tool", target: "agent", connectionType: "ai_tool" },
  ],
};

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    slug: "market-comps-lookup",
    name: "Comparables lookup",
    description: "On demand. Pulls imported comparables for a record type and rolls up average price and key metrics. Formerly the Comparables page.",
    category: "Pipeline",
    icon: "FileSpreadsheet",
    accent: "accent",
    triggerLabel: "Manual",
    graph: marketCompsGraph,
  },
  {
    slug: "one-click-underwriter",
    name: "One-click analyzer",
    description: "On demand. Runs a DCF model on a spreadsheet from the vault: indicated value, NOI, implied return, and (with a price) IRR and equity multiple. Formerly the Analyzer page.",
    category: "Pipeline",
    icon: "Calculator",
    accent: "accent",
    triggerLabel: "Manual",
    requiresVault: true,
    graph: underwriteGraph,
  },
  {
    slug: "lease-abstractor",
    name: "Document extractor",
    description: "On demand. Runs AI extraction on a document in the vault: extracted terms, financials, and key clauses. Formerly the Document Extractor page.",
    category: "Document management",
    icon: "ScrollText",
    accent: "accent",
    triggerLabel: "Manual",
    requiresVault: true,
    graph: leaseAbstractGraph,
  },
  {
    slug: "lease-expiration-outreach",
    name: "Contract renewal outreach",
    description: "Runs daily. Finds records with contracts expiring in the next 90 days, drafts outreach for each customer, and sends a digest to your team.",
    category: "Document management",
    icon: "CalendarClock",
    accent: "flag",
    triggerLabel: "Daily at 9am ET",
    graph: leaseExpirationGraph,
  },
  {
    slug: "tenant-renewal-drip",
    name: "Customer renewal drip sequence",
    description: "Weekly. Buckets expiring contracts into 90/60/30-day cohorts and drafts escalating renewal communications for each tier.",
    category: "Document management",
    icon: "Repeat",
    accent: "accent",
    triggerLabel: "Mondays 8am ET",
    graph: tenantRenewalDripGraph,
  },
  {
    slug: "new-listing-distribution",
    name: "New record distribution",
    description: "When a record is added, matches it against active contact requirements and drafts personalized blast emails.",
    category: "Prospecting",
    icon: "Send",
    accent: "verified",
    triggerLabel: "On new-record webhook",
    graph: newListingDistributionGraph,
  },
  {
    slug: "tour-followup",
    name: "Meeting follow-up",
    description: "After a meeting completes, drafts a personalized follow-up email citing specifics and the prospect's feedback.",
    category: "Client communication",
    icon: "MapPin",
    accent: "verified",
    triggerLabel: "On meeting-completed webhook",
    graph: tourFollowupGraph,
  },
  {
    slug: "coi-expiration",
    name: "COI expiration tracker",
    description: "Twice monthly, checks for insurance certificates expiring in the next 60 days and drafts renewal notices.",
    category: "Document management",
    icon: "ShieldCheck",
    accent: "flag",
    triggerLabel: "1st and 15th of each month",
    graph: coiExpirationGraph,
  },
  {
    slug: "investor-portfolio-report",
    name: "Client portfolio report",
    description: "Monthly. Generates per-client portfolio summaries covering status, revenue data, upcoming contract expirations, and open-item exposure.",
    category: "Client communication",
    icon: "PieChart",
    accent: "ink",
    triggerLabel: "1st of each month",
    graph: investorReportGraph,
  },
  {
    slug: "lease-abstraction-alert",
    name: "Document extraction summary",
    description: "When a document is extracted, summarizes key terms, flags risks (below-market pricing, missing escalation, onerous clauses), and emails your team.",
    category: "Document management",
    icon: "FileSearch",
    accent: "verified",
    triggerLabel: "On extraction-complete webhook",
    graph: leaseAbstractionAlertGraph,
  },
  {
    slug: "due-diligence-checklist",
    name: "Due diligence checklist",
    description: "When an offer is accepted, generates a complete DD checklist with deadlines, responsible parties, and items tailored to the deal.",
    category: "Pipeline",
    icon: "ClipboardCheck",
    accent: "verified",
    triggerLabel: "On offer-accepted webhook",
    requiresVault: true,
    graph: dueDiligenceGraph,
  },
  {
    slug: "market-update",
    name: "Market update for clients",
    description: "Manual trigger. Drafts personalized market updates for each client, referencing their specific portfolio and your outlook.",
    category: "Client communication",
    icon: "TrendingUp",
    accent: "ink",
    triggerLabel: "Manual (one-click)",
    requiresVault: true,
    graph: marketUpdateGraph,
  },
  {
    slug: "rent-escalation-tracker",
    name: "Price escalation tracker",
    description: "Monthly. Identifies contracts with price escalations due in the next 90 days, calculates new amounts, and flags overdue notices.",
    category: "Document management",
    icon: "ArrowUpRight",
    accent: "accent",
    triggerLabel: "1st of each month",
    graph: rentEscalationGraph,
  },
  {
    slug: "vacancy-marketing",
    name: "Availability marketing blast",
    description: "Manual trigger. Matches available records against all prospects, scores each match, and drafts personalized outreach.",
    category: "Prospecting",
    icon: "Megaphone",
    accent: "verified",
    triggerLabel: "Manual (one-click)",
    graph: vacancyMarketingGraph,
  },
  {
    slug: "post-close-retention",
    name: "Post-close client retention",
    description: "After a deal closes, drafts a thank-you email with a referral ask and reminds your team to add the client to ongoing market updates.",
    category: "Client communication",
    icon: "Heart",
    accent: "verified",
    triggerLabel: "On transaction-closed webhook",
    graph: postCloseRetentionGraph,
  },
  // ── Research ──
  {
    slug: "corridor-void-analysis",
    name: "Weekly research scan",
    description: "Weekly. Runs a directional research scan across a configured area (set once via workspace secrets), scores candidates on fit/size/availability/value, pulls full source detail on top candidates, and delivers a ranked research brief.",
    category: "Research",
    icon: "Radar",
    accent: "accent",
    triggerLabel: "Mondays 6am ET",
    graph: corridorVoidAnalysisGraph,
  },
  {
    // Clone resolves to the hand-crafted n8n JSON in n8n-templates.ts
    // (same slug); this graph is the catalog/editor preview.
    slug: "corridor-void-on-demand",
    name: "Research scan (on demand)",
    description: "On demand. Describe what your client needs and the area to search; an agent runs the research scan, scores and ranks candidates, and emails a ranked research brief with citations.",
    category: "Research",
    icon: "Radar",
    accent: "accent",
    triggerLabel: "Manual (one-click)",
    graph: corridorVoidOnDemandGraph,
  },
  {
    slug: "agent-corridor-brief",
    name: "AI agent: research brief",
    description: "Manual. An autonomous agent runs the research scan with a wired Chat Model, Memory, and research tool, then emails a cited brief. Showcases the agent + sub-node pattern from the editor.",
    category: "Research",
    icon: "Bot",
    accent: "accent",
    triggerLabel: "Manual",
    graph: agentCorridorBriefGraph,
  },
  {
    slug: "development-prospector",
    name: "Opportunity prospector",
    description: "Biweekly. Searches multiple target areas for candidates matching criteria, pulls full detail, de-dupes against existing pipeline, scores on location/size/readiness/price/risk.",
    category: "Research",
    icon: "Search",
    accent: "accent",
    triggerLabel: "Wednesdays 6am ET",
    graph: developmentProspectorGraph,
  },
  {
    slug: "acquisition-deep-dive",
    name: "Target deep-dive",
    description: "On demand. Given an identifier, runs the full research stack -- record search, source records, estimates, demographics, status, contract data -- and drafts a research memo.",
    category: "Research",
    icon: "Microscope",
    accent: "verified",
    triggerLabel: "On target webhook",
    graph: acquisitionDeepDiveGraph,
  },
  {
    slug: "multi-market-void-analysis",
    name: "Multi-market selection",
    description: "Manual trigger. You provide a thesis; Dante runs research scans across 3+ segments, scans competitive landscape around top candidates, and delivers a rigorous selection report.",
    category: "Research",
    icon: "Globe2",
    accent: "flag",
    triggerLabel: "Manual (one-click)",
    graph: multiMarketVoidGraph,
  },
  {
    slug: "environmental-scanner",
    name: "Risk scanner",
    description: "Manual trigger. Searches a target area for all matching candidates, runs risk checks on each, and categorizes every candidate as CLEAR, CAUTION, or FLAG with deeper-review recommendations.",
    category: "Research",
    icon: "Leaf",
    accent: "flag",
    triggerLabel: "Manual (one-click)",
    graph: environmentalScannerGraph,
  },
  {
    slug: "parcel-recheck",
    name: "Saved record re-check",
    description: "Monthly. Re-checks all saved records for changes in ownership, estimated value, attributes, or status since last review. Only alerts when something actually changed.",
    category: "Research",
    icon: "RefreshCw",
    accent: "ink",
    triggerLabel: "1st of each month",
    graph: parcelRecheckGraph,
  },
  {
    slug: "zoning-opportunity-finder",
    name: "Undervalued opportunity finder",
    description: "Biweekly. Searches target areas for candidates valued below surrounding options -- untapped potential in high-demand segments -- indicating upside plays.",
    category: "Research",
    icon: "Layers",
    accent: "accent",
    triggerLabel: "Biweekly Fridays 6am ET",
    graph: zoningOpportunityGraph,
  },
  // ── Phase B templates (new step types) ──
  {
    slug: "lease-expiry-auto-alert",
    name: "Contract expiry auto-alert",
    description: "Fires daily when contracts are within 90 days of expiration, emails each contact automatically.",
    category: "Document management",
    icon: "CalendarX2",
    accent: "verified",
    triggerLabel: "90 days before expiry",
    graph: leaseExpiryAutoAlertGraph,
  },
  {
    slug: "weekly-pipeline-digest",
    name: "Weekly pipeline digest",
    description: "Every Monday at 9am, query the full pipeline, generate an AI summary grouped by stage, and email the team.",
    category: "Pipeline",
    icon: "BarChart3",
    accent: "ink",
    triggerLabel: "Mondays 9am UTC",
    graph: weeklyPipelineDigestGraph,
  },
  {
    slug: "deal-stage-notification",
    name: "Deal stage notification",
    description: "When a record moves to a pending stage, automatically email the team with the deal details.",
    category: "Pipeline",
    icon: "ArrowRightLeft",
    accent: "verified",
    triggerLabel: "Stage change to pending",
    graph: dealStageNotificationGraph,
  },
  {
    slug: "deal-score-underwriting",
    name: "Deal score analysis",
    description: "Run a full due diligence battery on a deal -- NOI, cap rate, DSCR, cash-on-cash, LTV, and composite deal score. Generates a branded PDF report.",
    category: "Due diligence",
    icon: "Target",
    accent: "accent",
    triggerLabel: "Manual",
    graph: dealScoreUnderwritingGraph,
  },
];

export function getTemplate(slug: string): WorkflowTemplate | null {
  return WORKFLOW_TEMPLATES.find((t) => t.slug === slug) || null;
}

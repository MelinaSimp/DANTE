// lib/dante/n8n-templates.ts
//
// n8n-format versions of the highest-value workflow templates. During
// Phase 1 these coexist with the legacy Drift-format templates in
// templates.ts. The clone_template tool checks here first and falls
// back to the legacy format for templates not yet converted.
//
// Each template is a valid N8nWorkflowJSON that can be submitted
// directly to the n8n API via n8n-bridge.ts. All templates include
// the mandatory "Report to Drift" final node.
//
// Email delivery uses a 2-node pattern:
//   1. Code node builds the Resend payload (handles arrays cleanly)
//   2. httpRequest node POSTs JSON.stringify($json) to the Resend API
// Railway blocks outbound SMTP, so all email goes through Resend REST.
//
// Webhook-triggered templates: POST body is nested under $json.body
// by the n8n webhook node v2. Downstream expressions reference
// $json.body.fieldname or $node["TriggerName"].json.body.fieldname.

import type { N8nWorkflowJSON } from "./n8n-types";

export interface N8nWorkflowTemplate {
  slug: string;
  name: string;
  description: string;
  category: string;
  triggerLabel: string;
  workflow: N8nWorkflowJSON;
}

// -- Helper: Report to Drift node --

function reportNode(position: [number, number], connectFrom: string) {
  return {
    node: {
      id: "report-to-drift",
      name: "Report to Drift",
      type: "n8n-nodes-base.httpRequest" as const,
      typeVersion: 4,
      position,
      parameters: {
        url: "={{$env.DRIFT_CALLBACK_URL}}/api/dante/n8n/execution-callback",
        method: "POST",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "x-drift-n8n-secret", value: "={{$env.DRIFT_N8N_CALLBACK_SECRET}}" },
            { name: "Content-Type", value: "application/json" },
          ],
        },
        sendBody: true,
        bodyParameters: {
          parameters: [
            { name: "n8n_execution_id", value: "={{ $execution.id }}" },
            { name: "n8n_workflow_id", value: "={{ $workflow.id }}" },
            { name: "status", value: "success" },
            { name: "started_at", value: "={{ $now.toISO() }}" },
            { name: "finished_at", value: "={{ $now.toISO() }}" },
          ],
        },
      },
    },
    connectFrom,
  };
}

// -- Helper: Email send 2-node pattern --
// Returns [buildNode, sendNode] and the connection name for the send node.
// The buildPayloadCode must be a JS string that returns [{json: {from, to, subject, html}}].

function emailSendNodes(
  buildNodeName: string,
  sendNodeName: string,
  buildPayloadCode: string,
  buildPosition: [number, number],
  sendPosition: [number, number],
) {
  return {
    buildNode: {
      id: "build-email",
      name: buildNodeName,
      type: "n8n-nodes-base.code" as const,
      typeVersion: 2,
      position: buildPosition,
      parameters: { jsCode: buildPayloadCode },
    },
    sendNode: {
      id: "send-email",
      name: sendNodeName,
      type: "n8n-nodes-base.httpRequest" as const,
      typeVersion: 4,
      position: sendPosition,
      parameters: {
        url: "https://api.resend.com/emails",
        method: "POST",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "Authorization", value: "=Bearer {{$env.RESEND_API_KEY}}" },
            { name: "Content-Type", value: "application/json" },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify($json) }}",
      },
    },
    sendNodeName,
  };
}

// ================================================================
// 1 - Lease expiration outreach (cron)
// ================================================================

const leaseExpirationEmail = emailSendNodes(
  "Build Digest Email",
  "Send Broker Digest",
  `const items = $input.all();
const subject = 'Lease expiration alert -- ' + (items[0].json.expiring?.length || 0) + ' leases approaching';
const html = items[0].json.digest || items[0].json.text || JSON.stringify(items[0].json);

return [{
  json: {
    from: 'Drift <ops@driftai.studio>',
    to: 'broker@yourfirm.com',
    subject: subject,
    html: html,
  }
}];`,
  [80, 880],
  [80, 1040],
);

const leaseExpirationWorkflow: N8nWorkflowJSON = {
  name: "Lease expiration outreach",
  nodes: [
    {
      id: "trigger",
      name: "Daily 9am ET",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1,
      position: [80, 80],
      parameters: {
        rule: {
          interval: [{ field: "cronExpression", expression: "0 9 * * *" }],
        },
      },
    },
    {
      id: "query-properties",
      name: "Query Properties",
      type: "n8n-nodes-drift-cre.driftQueryProperties",
      typeVersion: 1,
      position: [80, 240],
      parameters: {
        filterField: "transaction_stage",
        filterValue: "listed",
        limit: 100,
      },
      credentials: { driftCreApi: { id: "1", name: "Drift CRE" } },
    },
    {
      id: "lookup-leases",
      name: "Lookup Leases",
      type: "n8n-nodes-drift-cre.driftLeaseLookup",
      typeVersion: 1,
      position: [80, 400],
      parameters: {
        status: "completed",
        limit: 100,
      },
      credentials: { driftCreApi: { id: "1", name: "Drift CRE" } },
    },
    {
      id: "analyze-expirations",
      name: "Analyze Expiring Leases",
      type: "n8n-nodes-drift-cre.driftAiAgent",
      typeVersion: 1,
      position: [80, 560],
      parameters: {
        objective: "Review the properties and lease data from previous steps. Identify leases expiring within the next 90 days from today. For each expiring lease, draft: (1) a professional SMS to the tenant about upcoming renewal discussion, (2) a summary email paragraph for the broker. Return structured JSON with the expiring lease list.",
        tools: ["clients.query", "memory.search"],
        maxSteps: 6,
      },
      credentials: { driftCreApi: { id: "1", name: "Drift CRE" } },
    },
    {
      id: "check-results",
      name: "Has Expiring Leases?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [80, 720],
      parameters: {
        conditions: {
          options: { caseSensitive: true },
          conditions: [{
            leftValue: "={{ $json.expiring?.length || 0 }}",
            rightValue: 0,
            operator: { type: "number", operation: "gt" },
          }],
        },
      },
    },
    leaseExpirationEmail.buildNode,
    leaseExpirationEmail.sendNode,
    reportNode([80, 1200], "Send Broker Digest").node,
  ],
  connections: {
    "Daily 9am ET": { main: [[{ node: "Query Properties", type: "main", index: 0 }]] },
    "Query Properties": { main: [[{ node: "Lookup Leases", type: "main", index: 0 }]] },
    "Lookup Leases": { main: [[{ node: "Analyze Expiring Leases", type: "main", index: 0 }]] },
    "Analyze Expiring Leases": { main: [[{ node: "Has Expiring Leases?", type: "main", index: 0 }]] },
    "Has Expiring Leases?": {
      main: [
        [{ node: "Build Digest Email", type: "main", index: 0 }],
        [{ node: "Report to Drift", type: "main", index: 0 }],
      ],
    },
    "Build Digest Email": { main: [[{ node: "Send Broker Digest", type: "main", index: 0 }]] },
    "Send Broker Digest": { main: [[{ node: "Report to Drift", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
};

// ================================================================
// 2 - Corridor void analysis (webhook)
// ================================================================

const corridorEmail = emailSendNodes(
  "Build Email Payload",
  "Send Email via Resend",
  `const items = $input.all();
// Webhook wraps POST body under .body
const triggerData = $('Run Corridor Analysis').first().json;
const brokerEmail = triggerData.body?.broker_email || triggerData.broker_email || 'unknown';
const subject = items[0].json.subject || 'Site intelligence brief -- corridor analysis';
const html = items[0].json.body || items[0].json.text || JSON.stringify(items[0].json);

return [{
  json: {
    from: 'Drift <ops@driftai.studio>',
    to: brokerEmail,
    subject: subject,
    html: html,
  }
}];`,
  [80, 560],
  [80, 720],
);

const corridorVoidAnalysisWorkflow: N8nWorkflowJSON = {
  name: "Corridor void analysis",
  nodes: [
    {
      id: "trigger",
      name: "Run Corridor Analysis",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [80, 80],
      parameters: {
        path: "{{DRIFT_WORKFLOW_ID}}",
        httpMethod: "POST",
        responseMode: "onReceived",
        input_fields: [
          { name: "brief", label: "What are you looking for?", type: "textarea", required: true, placeholder: "My client is a Chick-fil-A franchisee looking for a 1-2 acre pad site along the I-71 corridor between Medina and downtown Cleveland. Needs C-2 or better zoning, high traffic count, and no environmental issues." },
          { name: "corridor_anchors", label: "Search Area", type: "text", required: true, placeholder: "I-71 from Medina to downtown Cleveland, OH" },
          { name: "broker_email", label: "Send Results To (email)", type: "text", required: true, placeholder: "broker@yourfirm.com" },
        ],
      },
    },
    {
      id: "void-analysis",
      name: "Run Void Analysis",
      type: "n8n-nodes-drift-cre.driftAiAgent",
      typeVersion: 1,
      position: [80, 240],
      parameters: {
        // n8n expression mode: leading "=" once, plain {{ }} inline.
        // Mid-string "={{ }}" is treated as literal text and the agent
        // receives raw placeholders instead of the broker's brief.
        objective: "=A broker submitted this request: {{ $json.body.brief }}\n\nSearch area: {{ $json.body.corridor_anchors }}\n\nRun a void analysis along that corridor. Based on what the broker described, identify what types of sites and tenants they need. For each corridor segment, report which business categories are missing (the voids) and which are already saturated. Score and rank parcels that match the broker's criteria. Return the top 15 scored parcels. For the top 5, pull full parcel detail including auditor records, tax estimates, and environmental (EPA brownfield) status. Flag any disqualifying issues (contamination, wrong zoning, too small/large) up front.\n\nYour final answer goes straight into an email to the broker: write it as a client-ready site brief in plain prose with clear section headers — lead with the best opportunity and why, then the ranked list with acreage/zoning/assessed value per parcel, then risks. Keep the [ss:N] citation markers. Never output raw JSON or tool-call blocks.",
        tools: ["site_scan.void_analysis", "site_scan.detail", "memory.write"],
        maxSteps: 12,
      },
      credentials: { driftCreApi: { id: "1", name: "Drift CRE" } },
    },
    {
      // Second-stage agent, mirroring the weekly variant: the analysis
      // agent's final text is often raw tool output (a heavy void
      // analysis exhausts its steps), so a dedicated synthesis pass
      // turns it into the client-ready brief the email needs.
      id: "synthesize",
      name: "Write Executive Brief",
      type: "n8n-nodes-drift-cre.driftAiAgent",
      typeVersion: 1,
      position: [80, 400],
      parameters: {
        objective: "=You are a senior CRE analyst writing a site intelligence brief a broker will forward to their client. Rewrite the raw corridor void-analysis output below into a polished brief: lead with the single best opportunity and why, then the ranked parcel list with acreage, zoning, and assessed value, then risks and disqualifiers. Use clear section headers, plain prose, and keep every [ss:N] citation marker. Output only the brief — no raw JSON, no tool blocks.\n\nThe broker's original request: {{ $node[\"Run Corridor Analysis\"].json.body.brief }}\n\nRaw analysis:\n{{ $node[\"Run Void Analysis\"].json.text }}",
        tools: "",
        maxSteps: 4,
      },
      credentials: { driftCreApi: { id: "1", name: "Drift CRE" } },
    },
    corridorEmail.buildNode,
    corridorEmail.sendNode,
    reportNode([80, 880], "Send Email via Resend").node,
  ],
  connections: {
    "Run Corridor Analysis": { main: [[{ node: "Run Void Analysis", type: "main", index: 0 }]] },
    "Run Void Analysis": { main: [[{ node: "Write Executive Brief", type: "main", index: 0 }]] },
    "Write Executive Brief": { main: [[{ node: "Build Email Payload", type: "main", index: 0 }]] },
    "Build Email Payload": { main: [[{ node: "Send Email via Resend", type: "main", index: 0 }]] },
    "Send Email via Resend": { main: [[{ node: "Report to Drift", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
};



// ================================================================
// 4 - Acquisition deep-dive (webhook)
// ================================================================

const acquisitionEmail = emailSendNodes(
  "Build Memo Email",
  "Send Acquisition Memo",
  `const items = $input.all();
// Webhook wraps POST body under .body
const triggerData = $('Run Acquisition Analysis').first().json;
const brokerEmail = triggerData.body?.broker_email || triggerData.broker_email || 'unknown';
const address = triggerData.body?.address || triggerData.address || 'Target Property';
const subject = 'Acquisition memo -- ' + address;
const html = items[0].json.text || JSON.stringify(items[0].json);

return [{
  json: {
    from: 'Drift <ops@driftai.studio>',
    to: brokerEmail,
    subject: subject,
    html: html,
  }
}];`,
  [80, 720],
  [80, 880],
);

const acquisitionDeepDiveWorkflow: N8nWorkflowJSON = {
  name: "Acquisition target deep-dive",
  nodes: [
    {
      id: "trigger",
      name: "Run Acquisition Analysis",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [80, 80],
      parameters: {
        path: "{{DRIFT_WORKFLOW_ID}}",
        httpMethod: "POST",
        responseMode: "onReceived",
        input_fields: [
          { name: "address", label: "Property Address", type: "text", required: true, placeholder: "1600 Euclid Ave, Cleveland, OH 44115" },
          { name: "brief", label: "Deal Context", type: "textarea", required: false, placeholder: "Evaluating for a mixed-use redevelopment. Client budget is $2-3M. Interested in the building's condition and whether current zoning allows residential above retail." },
          { name: "broker_email", label: "Send Results To (email)", type: "text", required: true, placeholder: "broker@yourfirm.com" },
        ],
      },
    },
    {
      id: "parcel-intel",
      name: "Full Parcel Intelligence",
      type: "n8n-nodes-drift-cre.driftAiAgent",
      typeVersion: 1,
      position: [80, 240],
      parameters: {
        objective: `=Run full intelligence on: {{ $json.body.address }}. Deal context from the broker: {{ $json.body.brief || "general acquisition analysis" }}. (1) Search for the parcel to get parcel number and basic data. (2) Pull full detail: auditor records, tax estimate, census demographics, EPA brownfield status. (3) Note neighboring parcels and zoning. (4) Save key findings to memory. Compile all findings with full citations. If the broker described a specific use case or budget, flag anything that conflicts.`,
        tools: ["site_scan.search", "site_scan.detail", "memory.write", "memory.search"],
        maxSteps: 10,
      },
      credentials: { driftCreApi: { id: "1", name: "Drift CRE" } },
    },
    {
      id: "lease-check",
      name: "Check Lease Data",
      type: "n8n-nodes-drift-cre.driftLeaseLookup",
      typeVersion: 1,
      position: [80, 400],
      parameters: {
        status: "completed",
        limit: 5,
      },
      credentials: { driftCreApi: { id: "1", name: "Drift CRE" } },
    },
    {
      id: "draft-memo",
      name: "Draft Acquisition Memo",
      type: "n8n-nodes-drift-cre.driftAiAgent",
      typeVersion: 1,
      position: [80, 560],
      parameters: {
        objective: `Using the parcel intelligence and lease data from previous steps, draft a professional acquisition memo. The broker's deal context: ={{ $node["Run Acquisition Analysis"].json.body.brief || "general acquisition" }}. Sections: (1) Investment Thesis (3 sentences, tailored to the stated use case), (2) Property Overview, (3) Financial Snapshot (assessed value, tax, asking price if known), (4) Market Context (demographics), (5) Environmental Status, (6) Lease Analysis (if data exists), (7) Risks and Concerns (flag anything that conflicts with the broker's stated goals), (8) Recommended Next Steps. Format for email delivery.`,
        tools: ["memory.search"],
        maxSteps: 4,
      },
      credentials: { driftCreApi: { id: "1", name: "Drift CRE" } },
    },
    acquisitionEmail.buildNode,
    acquisitionEmail.sendNode,
    reportNode([80, 1040], "Send Acquisition Memo").node,
  ],
  connections: {
    "Run Acquisition Analysis": { main: [[{ node: "Full Parcel Intelligence", type: "main", index: 0 }]] },
    "Full Parcel Intelligence": { main: [[{ node: "Check Lease Data", type: "main", index: 0 }]] },
    "Check Lease Data": { main: [[{ node: "Draft Acquisition Memo", type: "main", index: 0 }]] },
    "Draft Acquisition Memo": { main: [[{ node: "Build Memo Email", type: "main", index: 0 }]] },
    "Build Memo Email": { main: [[{ node: "Send Acquisition Memo", type: "main", index: 0 }]] },
    "Send Acquisition Memo": { main: [[{ node: "Report to Drift", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
};



// -- Export --

export const N8N_TEMPLATES: N8nWorkflowTemplate[] = [
  {
    slug: "lease-expiration-outreach",
    name: "Lease expiration outreach",
    description: "Runs daily. Finds properties with leases expiring in the next 90 days, drafts outreach for each tenant, and sends a digest to the broker.",
    category: "Lease management",
    triggerLabel: "Daily at 9am ET",
    workflow: leaseExpirationWorkflow,
  },
  {
    // Own slug so it no longer shadows the WEEKLY corridor template in
    // templates.ts — the catalog card said "Mondays 6am ET" while
    // cloning silently delivered this webhook variant instead.
    slug: "corridor-void-on-demand",
    name: "Corridor void analysis (on demand)",
    description: "On demand. Enter corridor anchor points, target use and zoning. Searches for underserved business categories and vacant parcels, scores and ranks sites, delivers a ranked brief.",
    category: "Site intelligence",
    triggerLabel: "On demand (manual)",
    workflow: corridorVoidAnalysisWorkflow,
  },
  {
    slug: "acquisition-deep-dive",
    name: "Acquisition target deep-dive",
    description: "On demand. Enter a property address. Runs full parcel intelligence, checks existing lease data, and drafts an acquisition memo with investment thesis and risk assessment.",
    category: "Due diligence",
    triggerLabel: "On demand (manual)",
    workflow: acquisitionDeepDiveWorkflow,
  },
];

/** Look up an n8n template by slug. Returns null if not yet converted. */
export function getN8nTemplate(slug: string): N8nWorkflowTemplate | null {
  return N8N_TEMPLATES.find((t) => t.slug === slug) || null;
}

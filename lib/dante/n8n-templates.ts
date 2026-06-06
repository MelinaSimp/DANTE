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

import type { N8nWorkflowJSON } from "./n8n-types";

export interface N8nWorkflowTemplate {
  slug: string;
  name: string;
  description: string;
  category: string;
  triggerLabel: string;
  workflow: N8nWorkflowJSON;
}

// ── Helper: Report to Drift node ────────────────────────────

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

// ══════════════════════════════════════════════════════════════
// 1 - Lease expiration outreach (cron)
// ══════════════════════════════════════════════════════════════

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
    {
      id: "send-digest",
      name: "Send Broker Digest",
      type: "n8n-nodes-base.emailSend",
      typeVersion: 2,
      position: [80, 880],
      parameters: {
        fromEmail: "ops@driftai.studio",
        toEmail: "={{$env.BROKER_EMAIL}}",
        subject: "Lease expiration alert -- {{ $json.expiring?.length || 0 }} leases approaching",
        emailType: "html",
        html: "={{ $json.digest || $json.text || JSON.stringify($json) }}",
      },
    },
    reportNode([80, 1040], "send-digest").node,
  ],
  connections: {
    "Daily 9am ET": { main: [[{ node: "Query Properties", type: "main", index: 0 }]] },
    "Query Properties": { main: [[{ node: "Lookup Leases", type: "main", index: 0 }]] },
    "Lookup Leases": { main: [[{ node: "Analyze Expiring Leases", type: "main", index: 0 }]] },
    "Analyze Expiring Leases": { main: [[{ node: "Has Expiring Leases?", type: "main", index: 0 }]] },
    "Has Expiring Leases?": {
      main: [
        [{ node: "Send Broker Digest", type: "main", index: 0 }],
        [{ node: "Report to Drift", type: "main", index: 0 }],
      ],
    },
    "Send Broker Digest": { main: [[{ node: "Report to Drift", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
};

// ══════════════════════════════════════════════════════════════
// 2 - Corridor void analysis (cron)
// ══════════════════════════════════════════════════════════════

const corridorVoidAnalysisWorkflow: N8nWorkflowJSON = {
  name: "Corridor void analysis",
  nodes: [
    {
      id: "trigger",
      name: "Mondays 6am ET",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1,
      position: [80, 80],
      parameters: {
        rule: {
          interval: [{ field: "cronExpression", expression: "0 6 * * 1" }],
        },
      },
    },
    {
      id: "void-analysis",
      name: "Run Void Analysis",
      type: "n8n-nodes-drift-cre.driftAiAgent",
      typeVersion: 1,
      position: [80, 240],
      parameters: {
        objective: "Run a void analysis along the corridor defined by these anchor points: {{$env.CORRIDOR_ANCHORS}}. Target use: {{$env.TARGET_USE}}. Search for parcels that are {{$env.TARGET_ZONING}}-zoned, {{$env.ACREAGE_MIN}}-{{$env.ACREAGE_MAX}} acres, prefer vacant land. For each corridor segment, report which business categories are missing (the voids) and which are already saturated. Return the top 15 scored parcels. Then for the top 5 scoring sites, pull full parcel detail including auditor records, tax estimates, and environmental (EPA brownfield) status.",
        tools: ["site_scan.void_analysis", "site_scan.detail", "memory.write"],
        maxSteps: 12,
      },
      credentials: { driftCreApi: { id: "1", name: "Drift CRE" } },
    },
    {
      id: "synthesize",
      name: "Write Executive Brief",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [80, 400],
      parameters: {
        jsCode: `const items = $input.all();
const analysisText = items[0]?.json?.text || JSON.stringify(items[0]?.json || {});
// Pass through for email -- the AI agent already formatted the report
return [{
  json: {
    subject: "Site intelligence brief -- corridor analysis",
    body: analysisText,
  }
}];`,
      },
    },
    {
      id: "send-report",
      name: "Deliver Weekly Brief",
      type: "n8n-nodes-base.emailSend",
      typeVersion: 2,
      position: [80, 560],
      parameters: {
        fromEmail: "ops@driftai.studio",
        toEmail: "={{$env.BROKER_EMAIL}}",
        subject: "={{ $json.subject }}",
        emailType: "html",
        html: "={{ $json.body }}",
      },
    },
    reportNode([80, 720], "send-report").node,
  ],
  connections: {
    "Mondays 6am ET": { main: [[{ node: "Run Void Analysis", type: "main", index: 0 }]] },
    "Run Void Analysis": { main: [[{ node: "Write Executive Brief", type: "main", index: 0 }]] },
    "Write Executive Brief": { main: [[{ node: "Deliver Weekly Brief", type: "main", index: 0 }]] },
    "Deliver Weekly Brief": { main: [[{ node: "Report to Drift", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
};

// ══════════════════════════════════════════════════════════════
// 3 - Due diligence checklist (webhook)
// ══════════════════════════════════════════════════════════════

const dueDiligenceWorkflow: N8nWorkflowJSON = {
  name: "Due diligence checklist",
  nodes: [
    {
      id: "trigger",
      name: "Due Diligence Trigger",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [80, 80],
      parameters: {
        path: "due-diligence",
        httpMethod: "POST",
        responseMode: "lastNode",
      },
    },
    {
      id: "site-intel",
      name: "Full Site Intelligence",
      type: "n8n-nodes-drift-cre.driftDueDiligence",
      typeVersion: 1,
      position: [80, 240],
      parameters: {
        address: "={{ $json.body?.address || $json.address }}",
      },
      credentials: { driftCreApi: { id: "1", name: "Drift CRE" } },
    },
    {
      id: "vault-search",
      name: "Search Vault for Docs",
      type: "n8n-nodes-drift-cre.driftVaultSearch",
      typeVersion: 1,
      position: [80, 400],
      parameters: {
        query: "={{ $json.body?.address || $json.address }} due diligence environmental survey",
        topK: 5,
        kind: "",
      },
      credentials: { driftCreApi: { id: "1", name: "Drift CRE" } },
    },
    {
      id: "analyze",
      name: "Compile DD Report",
      type: "n8n-nodes-drift-cre.driftAiAgent",
      typeVersion: 1,
      position: [80, 560],
      parameters: {
        objective: "Using the site intelligence and vault documents from previous steps, compile a comprehensive due diligence checklist and report. Cover: (1) Property overview, (2) Environmental status (EPA, brownfield), (3) Census demographics, (4) Zoning and land use, (5) Tax assessment, (6) Any vault documents found. Flag risks prominently. Format as a professional DD memo.",
        tools: ["memory.write"],
        maxSteps: 4,
      },
      credentials: { driftCreApi: { id: "1", name: "Drift CRE" } },
    },
    {
      id: "generate-doc",
      name: "Generate DD PDF",
      type: "n8n-nodes-drift-cre.driftGenerateDocument",
      typeVersion: 1,
      position: [80, 720],
      parameters: {
        title: "Due Diligence Report",
        subtitle: "={{ $node['Due Diligence Trigger'].json.body?.address || 'Property Assessment' }}",
        sections: "={{ JSON.stringify($json.sections || [{heading: 'Report', body: $json.text || JSON.stringify($json)}]) }}",
      },
      credentials: { driftCreApi: { id: "1", name: "Drift CRE" } },
    },
    reportNode([80, 880], "generate-doc").node,
  ],
  connections: {
    "Due Diligence Trigger": { main: [[{ node: "Full Site Intelligence", type: "main", index: 0 }]] },
    "Full Site Intelligence": { main: [[{ node: "Search Vault for Docs", type: "main", index: 0 }]] },
    "Search Vault for Docs": { main: [[{ node: "Compile DD Report", type: "main", index: 0 }]] },
    "Compile DD Report": { main: [[{ node: "Generate DD PDF", type: "main", index: 0 }]] },
    "Generate DD PDF": { main: [[{ node: "Report to Drift", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
};

// ══════════════════════════════════════════════════════════════
// 4 - Acquisition deep-dive (webhook)
// ══════════════════════════════════════════════════════════════

const acquisitionDeepDiveWorkflow: N8nWorkflowJSON = {
  name: "Acquisition target deep-dive",
  nodes: [
    {
      id: "trigger",
      name: "Acquisition Trigger",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [80, 80],
      parameters: {
        path: "acquisition-deep-dive",
        httpMethod: "POST",
        responseMode: "lastNode",
      },
    },
    {
      id: "parcel-intel",
      name: "Full Parcel Intelligence",
      type: "n8n-nodes-drift-cre.driftAiAgent",
      typeVersion: 1,
      position: [80, 240],
      parameters: {
        objective: "Run full intelligence on: {{ $json.body?.address || $json.address }}. (1) Search for the parcel to get parcel number and basic data. (2) Pull full detail: auditor records, tax estimate, census demographics, EPA brownfield status. (3) Note neighboring parcels and zoning. (4) Save key findings to memory. Compile all findings with full citations.",
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
        objective: "Using the parcel intelligence and lease data from previous steps, draft a professional acquisition memo with these sections: (1) Investment Thesis (3 sentences), (2) Property Overview, (3) Financial Snapshot (assessed value, tax, asking price if known), (4) Market Context (demographics), (5) Environmental Status, (6) Lease Analysis (if data exists), (7) Risks and Concerns, (8) Recommended Next Steps. Format for email delivery.",
        tools: ["memory.search"],
        maxSteps: 4,
      },
      credentials: { driftCreApi: { id: "1", name: "Drift CRE" } },
    },
    {
      id: "send-memo",
      name: "Deliver Memo",
      type: "n8n-nodes-base.emailSend",
      typeVersion: 2,
      position: [80, 720],
      parameters: {
        fromEmail: "ops@driftai.studio",
        toEmail: "={{$env.BROKER_EMAIL}}",
        subject: "Acquisition memo -- {{ $node['Acquisition Trigger'].json.body?.address || 'Target Property' }}",
        emailType: "html",
        html: "={{ $json.text || JSON.stringify($json) }}",
      },
    },
    reportNode([80, 880], "send-memo").node,
  ],
  connections: {
    "Acquisition Trigger": { main: [[{ node: "Full Parcel Intelligence", type: "main", index: 0 }]] },
    "Full Parcel Intelligence": { main: [[{ node: "Check Lease Data", type: "main", index: 0 }]] },
    "Check Lease Data": { main: [[{ node: "Draft Acquisition Memo", type: "main", index: 0 }]] },
    "Draft Acquisition Memo": { main: [[{ node: "Deliver Memo", type: "main", index: 0 }]] },
    "Deliver Memo": { main: [[{ node: "Report to Drift", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
};

// ══════════════════════════════════════════════════════════════
// 5 - Market update report (cron)
// ══════════════════════════════════════════════════════════════

const marketUpdateWorkflow: N8nWorkflowJSON = {
  name: "Weekly market update",
  nodes: [
    {
      id: "trigger",
      name: "Fridays 7am ET",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1,
      position: [80, 80],
      parameters: {
        rule: {
          interval: [{ field: "cronExpression", expression: "0 7 * * 5" }],
        },
      },
    },
    {
      id: "web-research",
      name: "Research Market News",
      type: "n8n-nodes-drift-cre.driftWebSearch",
      typeVersion: 1,
      position: [80, 240],
      parameters: {
        query: "commercial real estate market news trends 2026",
        maxResults: 10,
        searchDepth: "basic",
      },
      credentials: { driftCreApi: { id: "1", name: "Drift CRE" } },
    },
    {
      id: "query-pipeline",
      name: "Current Pipeline",
      type: "n8n-nodes-drift-cre.driftQueryProperties",
      typeVersion: 1,
      position: [80, 400],
      parameters: {
        filterField: "",
        filterValue: "",
        limit: 50,
      },
      credentials: { driftCreApi: { id: "1", name: "Drift CRE" } },
    },
    {
      id: "query-listings",
      name: "Active Listings",
      type: "n8n-nodes-drift-cre.driftQueryListings",
      typeVersion: 1,
      position: [80, 560],
      parameters: {
        filterField: "status",
        filterValue: "active",
        limit: 25,
      },
      credentials: { driftCreApi: { id: "1", name: "Drift CRE" } },
    },
    {
      id: "compile-report",
      name: "Compile Market Report",
      type: "n8n-nodes-drift-cre.driftAiAgent",
      typeVersion: 1,
      position: [80, 720],
      parameters: {
        objective: "Using the web research, pipeline data, and active listings from previous steps, compile a weekly market update report. Include: (1) Market Headlines -- top 3-5 CRE news items with implications, (2) Pipeline Summary -- deals by stage, any stuck deals, (3) Listing Status -- new listings, price changes, days on market, (4) Outlook -- what to watch next week. Write for a busy broker who wants the highlights in 2 minutes.",
        tools: ["memory.search"],
        maxSteps: 4,
      },
      credentials: { driftCreApi: { id: "1", name: "Drift CRE" } },
    },
    {
      id: "send-report",
      name: "Deliver Market Update",
      type: "n8n-nodes-base.emailSend",
      typeVersion: 2,
      position: [80, 880],
      parameters: {
        fromEmail: "ops@driftai.studio",
        toEmail: "={{$env.BROKER_EMAIL}}",
        subject: "Weekly market update -- {{ $now.format('MMM d, yyyy') }}",
        emailType: "html",
        html: "={{ $json.text || JSON.stringify($json) }}",
      },
    },
    reportNode([80, 1040], "send-report").node,
  ],
  connections: {
    "Fridays 7am ET": { main: [[{ node: "Research Market News", type: "main", index: 0 }]] },
    "Research Market News": { main: [[{ node: "Current Pipeline", type: "main", index: 0 }]] },
    "Current Pipeline": { main: [[{ node: "Active Listings", type: "main", index: 0 }]] },
    "Active Listings": { main: [[{ node: "Compile Market Report", type: "main", index: 0 }]] },
    "Compile Market Report": { main: [[{ node: "Deliver Market Update", type: "main", index: 0 }]] },
    "Deliver Market Update": { main: [[{ node: "Report to Drift", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
};

// ── Export ───────────────────────────────────────────────────

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
    slug: "corridor-void-analysis",
    name: "Corridor void analysis",
    description: "Weekly corridor void analysis. Searches for underserved business categories and vacant parcels along configured anchor points, scores and ranks sites, delivers a ranked brief.",
    category: "Site intelligence",
    triggerLabel: "Mondays 6am ET",
    workflow: corridorVoidAnalysisWorkflow,
  },
  {
    slug: "due-diligence-checklist",
    name: "Due diligence checklist",
    description: "On demand. Runs full site intelligence (census, EPA, auditor, zoning), searches the vault for existing docs, and compiles a DD report with PDF.",
    category: "Due diligence",
    triggerLabel: "On demand (webhook)",
    workflow: dueDiligenceWorkflow,
  },
  {
    slug: "acquisition-deep-dive",
    name: "Acquisition target deep-dive",
    description: "On demand. Runs full parcel intelligence, checks existing lease data, and drafts an acquisition memo with investment thesis and risk assessment.",
    category: "Due diligence",
    triggerLabel: "On demand (webhook)",
    workflow: acquisitionDeepDiveWorkflow,
  },
  {
    slug: "market-update",
    name: "Weekly market update",
    description: "Every Friday. Researches CRE market news, reviews pipeline and listings, and delivers a concise market update email.",
    category: "Operations",
    triggerLabel: "Fridays 7am ET",
    workflow: marketUpdateWorkflow,
  },
];

/** Look up an n8n template by slug. Returns null if not yet converted. */
export function getN8nTemplate(slug: string): N8nWorkflowTemplate | null {
  return N8N_TEMPLATES.find((t) => t.slug === slug) || null;
}

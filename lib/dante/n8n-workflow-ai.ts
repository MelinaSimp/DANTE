// lib/dante/n8n-workflow-ai.ts
//
// "Generate with Dante" -- natural-language to n8n workflow JSON.
//
// This is the n8n counterpart to workflow-ai.ts. Instead of generating
// Drift's custom graph format, it generates n8n-compatible workflow JSON
// that can be submitted directly to the n8n REST API via n8n-bridge.ts.
//
// The two generators coexist during Phase 1 (parallel operation). Once
// all workflows are migrated, workflow-ai.ts is retired.

import type { BookSummary } from "./book-summary";
import { renderBookSummaryText } from "./book-summary";
import type { WorkflowProposal } from "./workflow-proposals";
import type { ConnectedIntegration } from "./workflow-ai";
import { complete as llmComplete } from "@/lib/llm/client";
import type {
  N8nWorkflowJSON,
  N8nNode,
  N8nConnections,
  N8nConnectionTarget,
} from "./n8n-types";
import { DRIFT_TO_N8N_NODE_TYPE } from "./n8n-types";

export interface GeneratedN8nWorkflow {
  name: string;
  description: string;
  workflow: N8nWorkflowJSON;
  _warnings?: string[];
}

// ── System Prompt ────────────────────────────────────────────

const N8N_SYSTEM_PROMPT = `
You are Dante, a workflow architect for a CRM called Drift used by
commercial real estate brokers and developers. You translate a user's
natural-language request into an n8n workflow definition. You output ONLY
a single JSON object, no prose, with this exact shape:

{
  "name": "short human title (under 60 chars)",
  "description": "one-sentence description",
  "workflow": {
    "name": "same title",
    "nodes": [ ... ],
    "connections": { ... },
    "settings": { "executionOrder": "v1" }
  }
}

N8N NODE FORMAT

Each node is an object:
{
  "id": "unique-uuid-style-id",
  "name": "Human Readable Name",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 1,
  "position": [x, y],
  "parameters": { ... }
}

CONNECTIONS FORMAT

Connections define data flow between nodes, keyed by source node NAME:
{
  "Source Node Name": {
    "main": [
      [{ "node": "Target Node Name", "type": "main", "index": 0 }]
    ]
  }
}

For IF nodes (two outputs), the main array has TWO inner arrays:
index 0 = true branch, index 1 = false branch.

AVAILABLE NODE TYPES

Built-in n8n nodes:
- "n8n-nodes-base.manualTrigger" (typeVersion: 1) -- user clicks Run
  parameters: {}

- "n8n-nodes-base.scheduleTrigger" (typeVersion: 1) -- cron/time trigger
  parameters: { "rule": { "interval": [{ "field": "cronExpression", "expression": "0 9 * * *" }] } }

- "n8n-nodes-base.webhook" (typeVersion: 2) -- inbound webhook
  parameters: { "path": "my-webhook-path", "httpMethod": "POST", "responseMode": "onReceived" }
  For sync execution (caller waits for result): "responseMode": "lastNode"

- "n8n-nodes-base.httpRequest" (typeVersion: 4)
  parameters: { "url": "https://...", "method": "GET"|"POST"|"PUT"|"PATCH"|"DELETE",
                "sendHeaders": true, "headerParameters": { "parameters": [{"name":"...", "value":"..."}] },
                "sendBody": true, "bodyParameters": { "parameters": [{"name":"...", "value":"..."}] } }

- "n8n-nodes-base.if" (typeVersion: 2) -- conditional branch
  parameters: { "conditions": { "options": { "caseSensitive": true },
    "conditions": [{ "leftValue": "={{ $json.score }}", "rightValue": 50, "operator": { "type": "number", "operation": "gt" } }] } }
  Two outputs: output 0 (true), output 1 (false).

- "n8n-nodes-base.switch" (typeVersion: 3) -- multi-way branch
  parameters: { "mode": "expression", "output": "={{ $json.category }}",
    "rules": { "rules": [
      { "value": "high", "outputIndex": 0 },
      { "value": "medium", "outputIndex": 1 },
      { "value": "low", "outputIndex": 2 }
    ] } }

- "n8n-nodes-base.wait" (typeVersion: 1) -- delay
  parameters: { "amount": 30, "unit": "seconds" }
  Units: seconds, minutes, hours, days.

- "n8n-nodes-base.splitInBatches" (typeVersion: 3) -- iterate over items
  parameters: { "batchSize": 1, "options": {} }

- "n8n-nodes-base.code" (typeVersion: 2) -- JavaScript/Python execution
  parameters: { "jsCode": "const items = $input.all();\n// your logic\nreturn items;" }
  Access input data with $input.all(). Return items array.

- "n8n-nodes-base.emailSend" (typeVersion: 2)
  parameters: { "fromEmail": "ops@driftai.studio", "toEmail": "...",
                "subject": "...", "emailType": "html", "html": "..." }

- "n8n-nodes-base.executeWorkflow" (typeVersion: 1) -- sub-workflow
  parameters: { "workflowId": "...", "options": {} }

Custom Drift CRE nodes (these connect to Drift's database):

- "n8n-nodes-drift-cre.driftQueryContacts" (typeVersion: 1)
  parameters: { "filterField": "type", "filterValue": "tenant", "limit": 50, "selectFields": "id, name, email, phone" }
  Emits array of contact objects. Leave filterField empty for all contacts.

- "n8n-nodes-drift-cre.driftUpdateContact" (typeVersion: 1)
  parameters: { "contactId": "={{ $json.id }}", "updateFields": { "notes": "Updated by workflow" } }

- "n8n-nodes-drift-cre.driftQueryProperties" (typeVersion: 1)
  parameters: { "filterField": "transaction_stage", "filterValue": "prospecting", "limit": 50 }
  Pipeline stages: prospecting, showing, under_contract, due_diligence, closing, closed, listed, off_market.

- "n8n-nodes-drift-cre.driftQueryListings" (typeVersion: 1)
  parameters: { "filterField": "status", "filterValue": "active", "limit": 25 }
  Status: active, pending, sold, expired, withdrawn.

- "n8n-nodes-drift-cre.driftQueryOffers" (typeVersion: 1)
  parameters: { "filterField": "status", "filterValue": "pending", "limit": 25 }
  Status: pending, accepted, rejected, countered, withdrawn, expired.

- "n8n-nodes-drift-cre.driftLeaseLookup" (typeVersion: 1)
  parameters: { "status": "completed", "limit": 10 }
  Returns abstracted lease terms.

- "n8n-nodes-drift-cre.driftVaultSearch" (typeVersion: 1)
  parameters: { "query": "lease expiration terms for...", "topK": 5, "kind": "" }
  Vector + keyword search across vault documents. Kind: lease, contract, appraisal, financial, legal, general, or "" for all.

- "n8n-nodes-drift-cre.driftWebSearch" (typeVersion: 1)
  parameters: { "query": "commercial real estate trends Cleveland 2026", "maxResults": 5, "searchDepth": "basic" }

- "n8n-nodes-drift-cre.driftDueDiligence" (typeVersion: 1)
  parameters: { "address": "1600 Euclid Ave, Cleveland, OH 44115" }
  Census + BLS + FEMA + EPA + Google Maps consolidated lookup.

- "n8n-nodes-drift-cre.driftGenerateDocument" (typeVersion: 1)
  parameters: { "title": "...", "subtitle": "...", "sections": [{"heading":"...","body":"..."}] }
  Generates branded PDF. Returns { url, filename }.

- "n8n-nodes-drift-cre.driftAiAgent" (typeVersion: 1)
  parameters: { "objective": "Analyze the properties and write a summary...",
                "tools": ["site_scan.void_analysis", "web.search", "memory.write"],
                "maxSteps": 10 }
  Autonomous AI reasoning loop with tool access. Use for complex analytical tasks.

- "n8n-nodes-drift-cre.driftApprovalGate" (typeVersion: 1)
  parameters: { "message": "Please approve this deal progression...",
                "approverRole": "owner", "notifyVia": "email", "timeoutHours": 72 }
  Pauses workflow, sends approval request, resumes on response.
  Two outputs: output 0 (approved), output 1 (rejected).

MANDATORY FINAL NODE

Every workflow MUST end with a "Report to Drift" HTTP Request node that
POSTs execution results back to Drift. Add this as the LAST node:

{
  "id": "report-to-drift",
  "name": "Report to Drift",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4,
  "position": [last_x, last_y + 160],
  "parameters": {
    "url": "={{$env.DRIFT_CALLBACK_URL}}/api/dante/n8n/execution-callback",
    "method": "POST",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        { "name": "x-drift-n8n-secret", "value": "={{$env.DRIFT_N8N_CALLBACK_SECRET}}" },
        { "name": "Content-Type", "value": "application/json" }
      ]
    },
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        { "name": "n8n_execution_id", "value": "={{ $execution.id }}" },
        { "name": "n8n_workflow_id", "value": "={{ $workflow.id }}" },
        { "name": "status", "value": "success" },
        { "name": "started_at", "value": "={{ $now.toISO() }}" },
        { "name": "finished_at", "value": "={{ $now.toISO() }}" }
      ]
    }
  }
}

Connect the last action node to "Report to Drift".

RULES

1. Every workflow starts with exactly ONE trigger node.
2. Use human-readable node names (used as keys in the connections object).
3. IDs should be unique UUID-like strings or descriptive slugs.
4. Access data from previous nodes with n8n expressions:
   {{ $json.fieldName }} -- current item's field
   {{ $node["Node Name"].json.fieldName }} -- specific node's output
   {{ $env.VARIABLE }} -- environment variable
   {{ $execution.id }} -- current execution ID
   {{ $workflow.id }} -- current workflow ID
   {{ $now }} -- current timestamp
5. Positions: trigger at [80, 80], then each node 160px below.
   Branches spread left/right by 240px.
6. All Drift CRE nodes need credentials: { "driftCreApi": { "id": "1", "name": "Drift CRE" } }
7. Prefer small graphs (3-6 action nodes). Use driftAiAgent for complex
   multi-step reasoning instead of chaining many individual nodes.
8. Never invent node types. Stick to the list above.

OUTPUT ONLY THE JSON OBJECT.
`.trim();

// ── Validation ────────────────────────────────────────────────

const VALID_N8N_TYPES = new Set([
  // Built-in
  "n8n-nodes-base.manualTrigger",
  "n8n-nodes-base.scheduleTrigger",
  "n8n-nodes-base.webhook",
  "n8n-nodes-base.httpRequest",
  "n8n-nodes-base.if",
  "n8n-nodes-base.switch",
  "n8n-nodes-base.wait",
  "n8n-nodes-base.splitInBatches",
  "n8n-nodes-base.code",
  "n8n-nodes-base.emailSend",
  "n8n-nodes-base.twilio",
  "n8n-nodes-base.executeWorkflow",
  "@n8n/n8n-nodes-langchain.openAi",
  // Custom Drift CRE
  "n8n-nodes-drift-cre.driftQueryContacts",
  "n8n-nodes-drift-cre.driftUpdateContact",
  "n8n-nodes-drift-cre.driftQueryProperties",
  "n8n-nodes-drift-cre.driftQueryListings",
  "n8n-nodes-drift-cre.driftQueryOffers",
  "n8n-nodes-drift-cre.driftLeaseLookup",
  "n8n-nodes-drift-cre.driftVaultSearch",
  "n8n-nodes-drift-cre.driftWebSearch",
  "n8n-nodes-drift-cre.driftDueDiligence",
  "n8n-nodes-drift-cre.driftGenerateDocument",
  "n8n-nodes-drift-cre.driftAiAgent",
  "n8n-nodes-drift-cre.driftApprovalGate",
]);

const DRIFT_CRE_TYPES = new Set(
  [...VALID_N8N_TYPES].filter((t) => t.startsWith("n8n-nodes-drift-cre.")),
);

const TRIGGER_TYPES = new Set([
  "n8n-nodes-base.manualTrigger",
  "n8n-nodes-base.scheduleTrigger",
  "n8n-nodes-base.webhook",
]);

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validate(raw: unknown): GeneratedN8nWorkflow {
  if (!isObj(raw)) throw new Error("Generator did not return an object");
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (!name) throw new Error("Generator response missing 'name'");

  const wf = raw.workflow;
  if (!isObj(wf)) throw new Error("Generator response missing 'workflow'");

  const nodesIn = Array.isArray(wf.nodes) ? wf.nodes : [];
  if (nodesIn.length === 0) throw new Error("Workflow must have at least one node");

  const warnings: string[] = [];
  const nodes: N8nNode[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  let triggerCount = 0;

  // Parse and validate nodes
  for (let i = 0; i < nodesIn.length; i++) {
    const n = nodesIn[i];
    if (!isObj(n)) throw new Error(`Node #${i} is not an object`);

    const id = typeof n.id === "string" ? n.id : `node-${i}`;
    const nodeName = typeof n.name === "string" ? n.name : `Node ${i}`;
    const type = typeof n.type === "string" ? n.type : "";
    const typeVersion = typeof n.typeVersion === "number" ? n.typeVersion : 1;

    if (seenIds.has(id)) throw new Error(`Duplicate node id: ${id}`);
    seenIds.add(id);

    // Deduplicate names (n8n uses names as connection keys)
    let uniqueName = nodeName;
    let nameCounter = 1;
    while (seenNames.has(uniqueName)) {
      uniqueName = `${nodeName} ${++nameCounter}`;
    }
    seenNames.add(uniqueName);

    if (!VALID_N8N_TYPES.has(type)) {
      // Try to map from Drift step type to n8n type
      const mapped = DRIFT_TO_N8N_NODE_TYPE[type];
      if (mapped) {
        warnings.push(`Mapped Drift type "${type}" to n8n type "${mapped}" on node "${nodeName}"`);
        (n as Record<string, unknown>).type = mapped;
      } else {
        throw new Error(`Node "${nodeName}" has unknown type: ${type}`);
      }
    }

    const finalType = typeof n.type === "string" ? n.type : type;
    if (TRIGGER_TYPES.has(finalType)) triggerCount++;

    const position: [number, number] = Array.isArray(n.position)
      ? [Number(n.position[0]) || 80, Number(n.position[1]) || 80 + i * 160]
      : [80, 80 + i * 160];

    const parameters = isObj(n.parameters) ? n.parameters : {};

    const node: N8nNode = {
      id,
      name: uniqueName,
      type: finalType,
      typeVersion,
      position,
      parameters: parameters as Record<string, unknown>,
    };

    // Add credentials for Drift CRE nodes
    if (DRIFT_CRE_TYPES.has(finalType) && !n.credentials) {
      node.credentials = { driftCreApi: { id: "1", name: "Drift CRE" } };
    } else if (isObj(n.credentials)) {
      node.credentials = n.credentials as Record<string, { id: string; name: string }>;
    }

    nodes.push(node);
  }

  if (triggerCount === 0) throw new Error("Workflow has no trigger node");
  if (triggerCount > 1) throw new Error("Workflow has more than one trigger node");

  // Parse connections
  const connectionsIn = isObj(wf.connections) ? wf.connections : {};
  const connections: N8nConnections = {};

  for (const [sourceName, connObj] of Object.entries(connectionsIn)) {
    if (!isObj(connObj)) continue;
    const main = Array.isArray(connObj.main) ? connObj.main : [];
    const parsedMain: N8nConnectionTarget[][] = [];

    for (const outputArr of main) {
      if (!Array.isArray(outputArr)) {
        parsedMain.push([]);
        continue;
      }
      const targets: N8nConnectionTarget[] = [];
      for (const t of outputArr) {
        if (!isObj(t)) continue;
        targets.push({
          node: String(t.node || ""),
          type: "main",
          index: typeof t.index === "number" ? t.index : 0,
        });
      }
      parsedMain.push(targets);
    }

    if (parsedMain.length > 0) {
      connections[sourceName] = { main: parsedMain };
    }
  }

  // Check for "Report to Drift" node
  const hasReportNode = nodes.some(
    (n) => n.name.toLowerCase().includes("report to drift"),
  );
  if (!hasReportNode) {
    // Auto-add the Report to Drift node
    const lastNode = nodes[nodes.length - 1];
    const lastPos = lastNode.position;
    const reportNode: N8nNode = {
      id: "report-to-drift",
      name: "Report to Drift",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4,
      position: [lastPos[0], lastPos[1] + 160],
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
    };
    nodes.push(reportNode);

    // Connect last action node to Report to Drift
    if (!connections[lastNode.name]) {
      connections[lastNode.name] = { main: [[]] };
    }
    connections[lastNode.name].main[0].push({
      node: "Report to Drift",
      type: "main",
      index: 0,
    });

    warnings.push("Auto-added mandatory 'Report to Drift' final node");
  }

  // Auto-layout if positions overlap
  const posSet = new Set(nodes.map((n) => `${n.position[0]},${n.position[1]}`));
  if (posSet.size < nodes.length) {
    nodes.forEach((n, i) => {
      n.position = [80, 80 + i * 160];
    });
    warnings.push("Auto-laid out nodes due to overlapping positions");
  }

  // Connectivity check: ensure all non-trigger nodes appear in connections
  const nameSet = new Set(nodes.map((n) => n.name));
  const referencedAsTarget = new Set<string>();
  const referencedAsSource = new Set<string>();
  for (const [src, conn] of Object.entries(connections)) {
    referencedAsSource.add(src);
    for (const outputArr of conn.main) {
      for (const t of outputArr) {
        referencedAsTarget.add(t.node);
      }
    }
  }

  const triggerNode = nodes.find((n) => TRIGGER_TYPES.has(n.type));
  if (triggerNode) {
    // Trigger should be a source but never a target
    referencedAsTarget.add(triggerNode.name);
  }

  // Find nodes that are not connected at all
  const disconnected = nodes.filter(
    (n) =>
      !referencedAsSource.has(n.name) &&
      !referencedAsTarget.has(n.name) &&
      n.name !== "Report to Drift",
  );
  if (disconnected.length > 0 && triggerNode) {
    // Wire them to the trigger
    if (!connections[triggerNode.name]) {
      connections[triggerNode.name] = { main: [[]] };
    }
    for (const d of disconnected) {
      connections[triggerNode.name].main[0].push({
        node: d.name,
        type: "main",
        index: 0,
      });
      warnings.push(`Auto-wired disconnected node "${d.name}" to trigger`);
    }
  }

  const workflow: N8nWorkflowJSON = {
    name: name.slice(0, 80),
    nodes,
    connections,
    active: false,
    settings: {
      executionOrder: "v1",
      ...(isObj(wf.settings) ? wf.settings : {}),
    },
  };

  return {
    name: name.slice(0, 80),
    description: description.slice(0, 240),
    workflow,
    _warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ── LLM Call ─────────────────────────────────────────────────

export async function generateN8nWorkflow(
  input:
    | string
    | {
        prompt: string;
        proposal?: WorkflowProposal;
        bookSummary?: BookSummary;
        connectedIntegrations?: ConnectedIntegration[];
      },
): Promise<GeneratedN8nWorkflow> {
  const prompt = (typeof input === "string" ? input : input.prompt).trim();
  if (!prompt) throw new Error("Prompt required");
  const proposal = typeof input === "string" ? undefined : input.proposal;
  const bookSummary = typeof input === "string" ? undefined : input.bookSummary;
  const connectedIntegrations = typeof input === "string" ? undefined : input.connectedIntegrations;

  const userMessage = buildUserMessage(prompt, proposal, bookSummary, connectedIntegrations);

  const result = await llmComplete({
    model: "claude-sonnet-4-6",
    temperature: 0.2,
    responseFormat: { type: "json_object" },
    messages: [
      { role: "system", content: N8N_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    feature: "workflow.generate.n8n",
  });
  const content = result.message.content;
  if (typeof content !== "string") throw new Error("LLM returned no content");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("LLM returned invalid JSON");
  }

  return validate(parsed);
}

function buildUserMessage(
  prompt: string,
  proposal: WorkflowProposal | undefined,
  bookSummary: BookSummary | undefined,
  connectedIntegrations?: ConnectedIntegration[],
): string {
  const parts: string[] = [];

  if (bookSummary) {
    parts.push(
      `WORKSPACE CONTEXT\n${renderBookSummaryText(bookSummary)}\n\nUse this to pick realistic filter values and avoid duplicating any existing workflow listed above.`,
    );
  }

  if (connectedIntegrations && connectedIntegrations.length > 0) {
    const list = connectedIntegrations
      .map((c) => `- ${c.display_name || c.provider} (${c.provider_kind || "general"})`)
      .join("\n");
    parts.push(
      `CONNECTED INTEGRATIONS\nThe workspace has these active data provider connections:\n${list}\n\nInclude HTTP Request nodes for these providers where they add value.`,
    );
  } else {
    parts.push(
      `CONNECTED INTEGRATIONS\nThe workspace has no third-party integrations connected.`,
    );
  }

  if (proposal) {
    parts.push(`BROKER'S ORIGINAL PROMPT\n"""\n${prompt}\n"""`);
    parts.push(
      `CHOSEN PROPOSAL\nTitle: ${proposal.title}\nDescription: ${proposal.description}\nTrigger: ${proposal.trigger.type} (${proposal.trigger.detail})\nNode sketch: ${proposal.node_sketch.join(" -> ")}\nProjected volume: ${
        proposal.projected_volume.estimate === null
          ? "unknown"
          : `~${proposal.projected_volume.estimate} ${proposal.projected_volume.unit}`
      } -- ${proposal.projected_volume.reasoning}\n\nBUILD SPEC (implement this exactly)\n${proposal.enriched_prompt}`,
    );
  } else {
    parts.push(prompt);
  }

  return parts.join("\n\n");
}

// lib/dante/n8n-converter.ts
//
// Converts a Drift WorkflowGraph (the legacy format used by templates
// and existing workflows) to an N8nWorkflowJSON (the n8n-compatible
// format consumed by the n8n bridge).
//
// Used for:
// 1. Bulk-converting remaining templates (Phase 2)
// 2. Migrating active user workflows from old engine to n8n
// 3. Validation: convert → push to n8n → dry-run comparison
//
// The converter is deterministic and handles all 28 Drift step types
// via the DRIFT_TO_N8N_NODE_TYPE mapping table.

import type { WorkflowGraph } from "./workflow-types";
import type { N8nWorkflowJSON, N8nNode, N8nConnections } from "./n8n-types";
import { DRIFT_TO_N8N_NODE_TYPE } from "./n8n-types";

interface ConversionResult {
  workflow: N8nWorkflowJSON;
  warnings: string[];
  unmappedTypes: string[];
}

const DRIFT_CRE_NODE_TYPES = new Set(
  Object.values(DRIFT_TO_N8N_NODE_TYPE).filter((t) =>
    t.startsWith("n8n-nodes-drift-cre."),
  ),
);

/**
 * Convert a Drift WorkflowGraph to n8n workflow JSON.
 *
 * Handles:
 * - Node type mapping via DRIFT_TO_N8N_NODE_TYPE
 * - Config → parameters translation per node type
 * - Edge → connections translation (source handle for conditionals)
 * - Position mapping
 * - Auto-adds "Report to Drift" final node
 * - Auto-adds credentials for Drift CRE nodes
 */
export function convertDriftToN8n(
  graph: WorkflowGraph,
  name: string,
): ConversionResult {
  const warnings: string[] = [];
  const unmappedTypes: string[] = [];
  const nodes: N8nNode[] = [];
  const nameMap = new Map<string, string>(); // drift id → n8n node name

  // ── Convert nodes ─────────────────────────────────────────
  for (const gNode of graph.nodes) {
    const driftType = gNode.type || (gNode.data?.step?.type as string) || "";
    const n8nType = DRIFT_TO_N8N_NODE_TYPE[driftType];

    if (!n8nType) {
      unmappedTypes.push(driftType);
      warnings.push(`Unmapped step type: ${driftType} (node ${gNode.id})`);
      continue;
    }

    const step = gNode.data?.step;
    const config = (step?.config || {}) as Record<string, unknown>;
    const nodeName = step?.name || gNode.id;

    // Ensure unique names (n8n uses names as connection keys)
    let uniqueName = nodeName;
    let counter = 1;
    const usedNames = new Set(nodes.map((n) => n.name));
    while (usedNames.has(uniqueName)) {
      uniqueName = `${nodeName} ${++counter}`;
    }
    nameMap.set(gNode.id, uniqueName);

    const position: [number, number] = [
      gNode.position?.x ?? 80,
      gNode.position?.y ?? 80,
    ];

    const n8nNode: N8nNode = {
      id: gNode.id,
      name: uniqueName,
      type: n8nType,
      typeVersion: getTypeVersion(n8nType),
      position,
      parameters: convertParameters(driftType, config, gNode.id),
    };

    // Add credentials for Drift CRE nodes
    if (DRIFT_CRE_NODE_TYPES.has(n8nType)) {
      n8nNode.credentials = { driftCreApi: { id: "1", name: "Drift CRE" } };
    }

    nodes.push(n8nNode);
  }

  // ── Convert edges → connections ───────────────────────────
  const connections: N8nConnections = {};

  for (const edge of graph.edges) {
    const sourceName = nameMap.get(edge.source);
    const targetName = nameMap.get(edge.target);
    if (!sourceName || !targetName) continue;

    if (!connections[sourceName]) {
      connections[sourceName] = { main: [[]] };
    }

    // Handle conditional outputs (sourceHandle: "true" or "false")
    const outputIndex = edge.sourceHandle === "false" ? 1 : 0;

    // Ensure the main array has enough output slots
    while (connections[sourceName].main.length <= outputIndex) {
      connections[sourceName].main.push([]);
    }

    connections[sourceName].main[outputIndex].push({
      node: targetName,
      type: "main",
      index: 0,
    });
  }

  // ── Add "Report to Drift" final node ──────────────────────
  const lastNode = nodes[nodes.length - 1];
  const reportPos: [number, number] = lastNode
    ? [lastNode.position[0], lastNode.position[1] + 160]
    : [80, 800];

  const reportNode: N8nNode = {
    id: "report-to-drift",
    name: "Report to Drift",
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4,
    position: reportPos,
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

  // Connect last action node(s) to Report to Drift
  // Find leaf nodes (nodes with no outgoing edges)
  const sourcesWithEdges = new Set(graph.edges.map((e) => e.source));
  const leafNodes = graph.nodes.filter((n) => !sourcesWithEdges.has(n.id));
  for (const leaf of leafNodes) {
    const leafName = nameMap.get(leaf.id);
    if (!leafName) continue;
    if (!connections[leafName]) {
      connections[leafName] = { main: [[]] };
    }
    // Add to the first output (or create it)
    if (!connections[leafName].main[0]) {
      connections[leafName].main[0] = [];
    }
    connections[leafName].main[0].push({
      node: "Report to Drift",
      type: "main",
      index: 0,
    });
  }

  return {
    workflow: {
      name,
      nodes,
      connections,
      settings: { executionOrder: "v1" },
    },
    warnings,
    unmappedTypes,
  };
}

// ── Parameter Conversion ────────────────────────────────────

function convertParameters(
  driftType: string,
  config: Record<string, unknown>,
  nodeId: string,
): Record<string, unknown> {
  switch (driftType) {
    case "trigger_cron":
      return {
        rule: {
          interval: [{
            field: "cronExpression",
            expression: String(config.cron || "0 9 * * *"),
          }],
        },
      };

    case "trigger_at":
      return {
        rule: {
          interval: [{
            field: "cronExpression",
            expression: String(config.cron || config.at || "0 9 * * *"),
          }],
        },
      };

    case "trigger_manual": {
      // Convert to webhook trigger so execution works via HTTP POST.
      // The path placeholder gets replaced with the Drift workflow ID
      // at clone/push time.
      const fields = config.input_fields;
      return {
        path: String(config.webhook_path || nodeId),
        httpMethod: "POST",
        responseMode: "onReceived",
        ...(Array.isArray(fields) && fields.length > 0
          ? { input_fields: fields }
          : {}),
      };
    }

    case "trigger_webhook":
      return {
        path: String(config.path || nodeId),
        httpMethod: "POST",
        responseMode: "onReceived",
      };

    case "send_email":
      return {
        fromEmail: "ops@driftai.studio",
        toEmail: convertTemplateExpr(String(config.to || "={{$env.BROKER_EMAIL}}")),
        subject: convertTemplateExpr(String(config.subject || "")),
        emailType: "html",
        html: convertTemplateExpr(String(config.text || config.body || "")),
      };

    case "send_sms":
      return {
        from: "={{$env.TWILIO_FROM_NUMBER}}",
        to: convertTemplateExpr(String(config.to_phone || config.to || "")),
        message: convertTemplateExpr(String(config.body || config.text || "")),
      };

    case "openai":
      return {
        // Map to a Code node that calls the LLM API, since n8n's
        // OpenAI node doesn't support Claude models
        jsCode: `// AI synthesis step (converted from Drift openai node)
const objective = ${JSON.stringify(String(config.prompt || config.objective || ""))};
const system = ${JSON.stringify(String(config.system || "You are a CRE analyst."))};
// This is a placeholder -- the actual LLM call happens via the Drift API
const items = $input.all();
return items.map(item => ({
  json: {
    ...item.json,
    _ai_prompt: objective,
    _ai_system: system,
  }
}));`,
      };

    case "agent":
      return {
        objective: convertTemplateExpr(String(config.objective || "")),
        tools: Array.isArray(config.tools)
          ? (config.tools as string[]).join(", ")
          : String(config.tools || ""),
        maxSteps: Number(config.max_steps || config.maxSteps || 10),
      };

    case "condition":
      return {
        conditions: {
          options: { caseSensitive: true },
          conditions: [{
            leftValue: convertTemplateExpr(String(config.field || config.condition || "")),
            rightValue: config.value ?? "",
            operator: {
              type: config.operator === "gt" || config.operator === "lt" ? "number" : "string",
              operation: String(config.operator || "equals"),
            },
          }],
        },
      };

    case "code":
    case "transform":
      return {
        jsCode: String(config.code || config.expression || "return $input.all();"),
      };

    case "delay":
      return {
        amount: Number(config.duration || config.seconds || 30),
        unit: String(config.unit || "seconds"),
      };

    case "http":
      return {
        url: convertTemplateExpr(String(config.url || "")),
        method: String(config.method || "GET"),
      };

    case "query_clients": {
      const f = (config.filter || {}) as Record<string, unknown>;
      return {
        filterField: String(f.field || ""),
        filterValue: String(f.value || ""),
        limit: Number(config.limit || 50),
      };
    }

    case "query_properties": {
      const f = (config.filter || {}) as Record<string, unknown>;
      return {
        filterField: String(f.field || config.filterField || ""),
        filterValue: String(f.value || config.filterValue || ""),
        limit: Number(config.limit || 50),
      };
    }

    case "query_listings": {
      const f = (config.filter || {}) as Record<string, unknown>;
      return {
        filterField: String(f.field || config.filterField || "status"),
        filterValue: String(f.value || config.filterValue || "active"),
        limit: Number(config.limit || 25),
      };
    }

    case "query_offers": {
      const f = (config.filter || {}) as Record<string, unknown>;
      return {
        filterField: String(f.field || config.filterField || "status"),
        filterValue: String(f.value || config.filterValue || "pending"),
        limit: Number(config.limit || 25),
      };
    }

    case "lease_lookup":
      return {
        status: String(config.status || "completed"),
        limit: Number(config.limit || 10),
      };

    case "archive_lookup":
      return {
        query: convertTemplateExpr(String(config.query || "")),
        topK: Number(config.top_k || config.topK || 5),
        kind: String(config.kind || ""),
      };

    case "approval":
      return {
        message: convertTemplateExpr(String(config.message || "")),
        approverRole: String(config.approver_role || config.approverRole || "owner"),
        notifyVia: String(config.notify_via || config.notifyVia || "email"),
        timeoutHours: Number(config.timeout_hours || config.timeoutHours || 72),
      };

    case "due_diligence":
      return {
        address: convertTemplateExpr(String(config.address || "")),
      };

    case "generate_document":
      return {
        title: convertTemplateExpr(String(config.title || "")),
        subtitle: convertTemplateExpr(String(config.subtitle || "")),
        sections: JSON.stringify(config.sections || []),
      };

    case "web_search":
      return {
        query: convertTemplateExpr(String(config.query || "")),
        maxResults: Number(config.max_results || config.maxResults || 5),
        searchDepth: String(config.search_depth || config.searchDepth || "basic"),
      };

    default:
      return config;
  }
}

/**
 * Convert Drift template expressions like {{steps.id.field}} to
 * n8n expressions like {{ $node["Node Name"].json.field }}.
 *
 * Also handles {{secrets.key}} → {{$env.KEY}}.
 */
function convertTemplateExpr(text: string): string {
  if (!text) return text;

  // {{secrets.key}} → ={{$env.KEY}}
  let result = text.replace(
    /\{\{\s*secrets\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g,
    (_match, key: string) => `={{$env.${key.toUpperCase()}}}`,
  );

  // {{steps.trigger.input.fieldName}} → ={{ $json.fieldName }}
  // Per-execution input data: n8n exposes API-supplied data as $json on
  // the trigger node's output. Must precede the generic steps.id.field
  // rule below, otherwise "steps.trigger.input.X" gets caught by the
  // generic pattern and mapped incorrectly.
  result = result.replace(
    /\{\{\s*steps\.trigger\.input\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g,
    (_match, field: string) => `={{ $json.${field} }}`,
  );

  // {{steps.id.field}} → ={{ $node["id"].json.field }}
  // Note: in n8n, we use the node name, not ID. Since we don't have
  // the name map here, we use the step ID as-is -- the n8n validator
  // in n8n-workflow-ai.ts handles deduplication.
  result = result.replace(
    /\{\{\s*steps\.([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_.]+)\s*\}\}/g,
    (_match, stepId: string, field: string) =>
      `={{ $node["${stepId}"].json.${field} }}`,
  );

  // If the entire string is a single expression, prefix with =
  if (result.startsWith("={{") || result.includes("={{")) {
    return result;
  }
  // If there's a {{ but no =, add it
  if (result.includes("{{") && !result.includes("={{")) {
    result = result.replace(/\{\{/g, "={{");
  }

  return result;
}

function getTypeVersion(n8nType: string): number {
  const versions: Record<string, number> = {
    "n8n-nodes-base.manualTrigger": 1,
    "n8n-nodes-base.scheduleTrigger": 1,
    "n8n-nodes-base.webhook": 2,
    "n8n-nodes-base.httpRequest": 4,
    "n8n-nodes-base.if": 2,
    "n8n-nodes-base.switch": 3,
    "n8n-nodes-base.wait": 1,
    "n8n-nodes-base.splitInBatches": 3,
    "n8n-nodes-base.code": 2,
    "n8n-nodes-base.emailSend": 2,
    "n8n-nodes-base.twilio": 1,
    "n8n-nodes-base.executeWorkflow": 1,
    "@n8n/n8n-nodes-langchain.openAi": 1,
  };
  return versions[n8nType] || 1;
}

// ── Bulk Template Conversion ────────────────────────────────

import { WORKFLOW_TEMPLATES } from "./templates";
import { getN8nTemplate } from "./n8n-templates";
import type { N8nWorkflowTemplate } from "./n8n-templates";

/**
 * Convert all legacy Drift templates to n8n format.
 * Returns templates grouped by conversion status.
 */
export function convertAllTemplates(): {
  converted: N8nWorkflowTemplate[];
  failed: Array<{ slug: string; error: string }>;
} {
  const converted: N8nWorkflowTemplate[] = [];
  const failed: Array<{ slug: string; error: string }> = [];

  for (const template of WORKFLOW_TEMPLATES) {
    // Skip templates already manually converted
    if (getN8nTemplate(template.slug)) continue;

    try {
      const result = convertDriftToN8n(template.graph, template.name);

      if (result.unmappedTypes.length > 0) {
        failed.push({
          slug: template.slug,
          error: `Unmapped types: ${result.unmappedTypes.join(", ")}`,
        });
        continue;
      }

      converted.push({
        slug: template.slug,
        name: template.name,
        description: template.description,
        category: template.category,
        triggerLabel: template.triggerLabel,
        workflow: result.workflow,
      });
    } catch (err) {
      failed.push({
        slug: template.slug,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { converted, failed };
}

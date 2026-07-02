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
  // Report-to-Drift nodes skipped during pass-through (re-added fresh at
  // the end). Edges pointing at them must not count when finding leaves.
  const skippedReportIds = new Set<string>();

  // ── Approach B: fold agent sub-nodes into the agent's config ──
  // chat_model / agent_memory / agent_tool are a visual/config layer.
  // We collapse them into their connected agent's parameters and never
  // emit them (their ai_* edges drop out for free, since the sub-node
  // is excluded from nameMap below and edge conversion skips unknown ends).
  const SUB_TYPES = new Set(["chat_model", "agent_memory", "agent_tool"]);
  const subNodeIds = new Set(
    graph.nodes
      .filter((n) => SUB_TYPES.has(n.type || (n.data?.step?.type as string) || ""))
      .map((n) => n.id),
  );
  const agentFold: Record<string, { model?: string; tools: string[]; memory: boolean }> = {};
  for (const e of graph.edges) {
    const ct = e.connectionType;
    if (ct !== "ai_model" && ct !== "ai_memory" && ct !== "ai_tool") continue;
    const sub = graph.nodes.find((n) => n.id === e.source);
    const cfg = (sub?.data?.step?.config || {}) as Record<string, unknown>;
    const fold = (agentFold[e.target] ||= { tools: [], memory: false });
    if (ct === "ai_model" && typeof cfg.model === "string") fold.model = cfg.model;
    if (ct === "ai_tool" && typeof cfg.tool === "string") fold.tools.push(cfg.tool);
    if (ct === "ai_memory") fold.memory = true;
  }

  // ── Convert nodes ─────────────────────────────────────────
  for (const gNode of graph.nodes) {
    if (subNodeIds.has(gNode.id)) continue; // folded into the agent above
    const driftType = gNode.type || (gNode.data?.step?.type as string) || "";

    // Round-trip pass-through: graphs that were cloned from n8n JSON and
    // re-saved by the canvas editor carry n8n node types directly
    // ("n8n-nodes-base.webhook", "n8n-nodes-drift-cre.driftLeaseAbstractor",
    // "@n8n/n8n-nodes-langchain.openAi"). Those must NOT go through the
    // Drift→n8n mapping table — they already are n8n nodes. Dropping them
    // (the old behavior) collapsed real workflows into an empty webhook +
    // Report-to-Drift shell that n8n refuses to register a webhook for.
    const isAlreadyN8nType =
      driftType.startsWith("n8n-nodes-") || driftType.startsWith("@n8n/");
    if (isAlreadyN8nType) {
      const step = gNode.data?.step;
      const params = (step?.config ||
        (gNode as unknown as Record<string, unknown>).parameters ||
        {}) as Record<string, unknown>;
      const rawName = step?.name || gNode.id;

      // The editor re-saves the auto-added completion callback too —
      // skip it here; the converter appends a fresh one below.
      const isReportToDrift =
        gNode.id === "report-to-drift" ||
        (typeof params.url === "string" &&
          params.url.includes("/api/dante/n8n/execution-callback"));
      if (isReportToDrift) {
        skippedReportIds.add(gNode.id);
        continue;
      }

      let uniqueName = rawName;
      let counter = 1;
      const usedNames = new Set(nodes.map((n) => n.name));
      while (usedNames.has(uniqueName)) {
        uniqueName = `${rawName} ${++counter}`;
      }
      nameMap.set(gNode.id, uniqueName);

      const n8nNode: N8nNode = {
        id: gNode.id,
        name: uniqueName,
        type: driftType,
        typeVersion:
          (gNode as unknown as Record<string, unknown>).typeVersion as number ??
          getTypeVersion(driftType),
        position: [gNode.position?.x ?? 80, gNode.position?.y ?? 80],
        parameters: params,
      };
      if (DRIFT_CRE_NODE_TYPES.has(driftType) || driftType.startsWith("n8n-nodes-drift-cre.")) {
        n8nNode.credentials = { driftCreApi: { id: "1", name: "Drift CRE" } };
      }
      nodes.push(n8nNode);
      continue;
    }

    const n8nType = DRIFT_TO_N8N_NODE_TYPE[driftType];

    if (!n8nType) {
      unmappedTypes.push(driftType);
      warnings.push(`Unmapped step type: ${driftType} (node ${gNode.id})`);
      continue;
    }

    const step = gNode.data?.step;
    let config = (step?.config || {}) as Record<string, unknown>;
    const fold = agentFold[gNode.id];
    if (driftType === "agent" && fold) {
      const existingTools = Array.isArray(config.tools) ? (config.tools as unknown[]) : [];
      const memoryTools = fold.memory ? ["memory.search", "memory.write"] : [];
      config = {
        ...config,
        ...(fold.model ? { model: fold.model } : {}),
        tools: Array.from(new Set([...existingTools, ...fold.tools, ...memoryTools].filter(Boolean))),
      };
    }
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
  // Find leaf nodes (nodes with no outgoing edges). Edges that pointed at
  // a skipped Report-to-Drift node don't count — their source is still a
  // leaf and must be wired to the freshly added Report node.
  const sourcesWithEdges = new Set(
    graph.edges
      .filter((e) => !skippedReportIds.has(e.target))
      .map((e) => e.source),
  );
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

  // Rewrite $node["<stepId>"] references to the actual node NAMES.
  // convertTemplateExpr only knows step IDs ("scan"), but n8n resolves
  // $node[...] by display name ("Run corridor void analysis") — unmapped
  // references kill the run with "Referenced node doesn't exist".
  const rewriteNodeRefs = (v: unknown): unknown => {
    if (typeof v === "string") {
      return v.replace(/\$node\["([^"]+)"\]/g, (match, ref: string) => {
        const mapped = nameMap.get(ref);
        return mapped && mapped !== ref ? `$node["${mapped}"]` : match;
      });
    }
    if (Array.isArray(v)) return v.map(rewriteNodeRefs);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, inner] of Object.entries(v as Record<string, unknown>)) {
        out[k] = rewriteNodeRefs(inner);
      }
      return out;
    }
    return v;
  };
  for (const node of nodes) {
    node.parameters = rewriteNodeRefs(node.parameters) as Record<string, unknown>;
  }

  // Carry the trigger's timezone up to workflow settings — n8n evaluates
  // cron expressions in the workflow timezone, and dropping it silently
  // shifts "6am ET" to whatever the instance default is.
  const triggerTz = graph.nodes
    .map((n) => (n.data?.step?.config as Record<string, unknown> | undefined)?.timezone)
    .find((tz): tz is string => typeof tz === "string" && tz.length > 0);

  return {
    workflow: {
      name,
      nodes,
      connections,
      settings: { executionOrder: "v1", ...(triggerTz ? { timezone: triggerTz } : {}) },
    },
    warnings,
    unmappedTypes,
  };
}

// ── Parameter Conversion ────────────────────────────────────
// Exported for workflow-surgery.ts, which builds replacement n8n nodes
// when Dante structurally edits a workflow (e.g. email → SMS swap).

export function convertParameters(
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

    case "send_email": {
      // Railway blocks outbound SMTP. Send via Resend REST API instead.
      const toExpr = convertTemplateExpr(String(config.to || "={{$env.BROKER_EMAIL}}"));
      const subjectExpr = convertTemplateExpr(String(config.subject || ""));
      const bodyExpr = convertTemplateExpr(String(config.text || config.body || ""));
      return {
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
        jsonBody: `={{ JSON.stringify({ from: "Drift <ops@driftai.studio>", to: String(${stripExprWrapper(toExpr)}), subject: String(${stripExprWrapper(subjectExpr)}), html: String(${stripExprWrapper(bodyExpr)}) }) }}`,
      };
    }

    case "send_sms": {
      // Delivery runs through Drift's SendBlue sender (iMessage with SMS
      // fallback) via the workflow-send endpoint — the n8n instance has
      // no SMS credentials of its own. Workspace resolution happens
      // server-side from the n8n workflow id.
      const toExpr = convertTemplateExpr(String(config.to_phone || config.to || ""));
      const bodyExpr = convertTemplateExpr(String(config.body || config.text || config.message || ""));
      const fromNumber = String(config.from_number || "");
      return {
        url: "={{$env.DRIFT_CALLBACK_URL}}/api/sms/workflow-send",
        method: "POST",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "x-drift-n8n-secret", value: "={{$env.DRIFT_N8N_CALLBACK_SECRET}}" },
            { name: "Content-Type", value: "application/json" },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: `={{ JSON.stringify({ n8n_workflow_id: $workflow.id, to: String(${stripExprWrapper(toExpr)}), body: String(${stripExprWrapper(bodyExpr)})${fromNumber ? `, from_number: ${JSON.stringify(fromNumber)}` : ""} }) }}`,
      };
    }

    case "openai": {
      // LLM prompt step → Drift agent node (objective/tools/maxSteps).
      // The system prompt folds into the objective; no tools are wired
      // beyond the node defaults — this is a synthesis step, not a
      // research loop, so cap the reasoning budget low.
      const system = String(config.system || "You are a CRE analyst.");
      const prompt = convertTemplateExpr(String(config.prompt || config.objective || ""));
      const promptBody = prompt.startsWith("=") ? prompt.slice(1) : prompt;
      return {
        objective: `=${system}\n\n${promptBody}`,
        tools: "",
        maxSteps: 4,
      };
    }

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

    case "lease_lookup":
      return {
        status: String(config.status || "completed"),
        limit: Number(config.limit || 10),
      };

    case "market_comps":
      return {
        propertyType: convertTemplateExpr(String(config.property_type || config.propertyType || "")),
        limit: Number(config.limit || 50),
      };

    case "underwrite":
      // vaultItemId + purchasePrice pass through as expressions so they can
      // resolve from the manual-trigger form input at run time.
      return {
        vaultItemId: convertTemplateExpr(String(config.vault_item_id || config.vaultItemId || "")),
        purchasePrice: convertTemplateExpr(String(config.purchase_price ?? config.purchasePrice ?? 0)),
      };

    case "lease_abstract":
      return {
        vaultItemId: convertTemplateExpr(String(config.vault_item_id || config.vaultItemId || "")),
        refinePrompt: Boolean(config.refine_prompt ?? config.refinePrompt ?? false),
        webSearch: Boolean(config.web_search ?? config.webSearch ?? false),
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

  // n8n only evaluates a parameter as an expression when the WHOLE
  // string starts with "=" — inline placeholders then use plain {{ }}.
  // The old implementation emitted mid-string "={{ ... }}", which n8n
  // treats as literal text: agents received prompts containing raw
  // "={{ $json.body.brief }}" instead of the broker's actual words.

  // {{secrets.key}} → {{$env.KEY}}
  // (Workspace secrets are inlined at clone time now; this env mapping
  // is the fallback for anything that slips through unresolved.)
  let result = text.replace(
    /\{\{\s*secrets\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g,
    (_match, key: string) => `{{$env.${key.toUpperCase()}}}`,
  );

  // {{steps.trigger.input.fieldName}} → {{ $json.body.fieldName }}
  // Drift triggers become webhook (typeVersion 2) nodes, and webhook v2
  // nests the POST payload under `body` ({headers, params, query, body}).
  // Must precede the generic steps.id.field rule below, otherwise
  // "steps.trigger.input.X" gets caught by the generic pattern.
  result = result.replace(
    /\{\{\s*steps\.trigger\.input\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g,
    (_match, field: string) => `{{ $json.body.${field} }}`,
  );

  // {{steps.id.field}} → {{ $node["id"].json.field }}
  // Note: in n8n, we use the node name, not ID. Since we don't have
  // the name map here, we use the step ID as-is -- the n8n validator
  // in n8n-workflow-ai.ts handles deduplication.
  result = result.replace(
    /\{\{\s*steps\.([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_.]+)\s*\}\}/g,
    (_match, stepId: string, field: string) =>
      `{{ $node["${stepId}"].json.${field} }}`,
  );

  // Any placeholder present → the whole string must be expression-mode.
  if (result.includes("{{") && !result.startsWith("=")) {
    result = `=${result}`;
  }

  return result;
}

/**
 * Strip the n8n expression wrapper (={{ ... }}) to get the raw JS expression.
 * Used when embedding an expression inside a JSON.stringify() expression.
 * E.g. "={{ $json.email }}" → "$json.email"
 *      "plain text"         → '"plain text"'
 */
function stripExprWrapper(expr: string): string {
  // Match ={{ ... }} at the boundaries
  const match = expr.match(/^={{ ([\s\S]*) }}$/);
  if (match) return match[1];
  // Mixed expression-mode string ("=Digest for {{ $json.body.x }}"):
  // convert to a JS template literal so inline placeholders still
  // evaluate when embedded inside the jsonBody expression.
  if (expr.startsWith("=") && expr.includes("{{")) {
    const body = expr
      .slice(1)
      .replace(/`/g, "\\`")
      .replace(/\$\{/g, "\\${")
      .replace(/\{\{\s*([\s\S]*?)\s*\}\}/g, (_m, inner: string) => `\${ ${inner} }`);
    return `\`${body}\``;
  }
  // Not an expression -- return as a quoted string literal
  return JSON.stringify(expr);
}

export function getTypeVersion(n8nType: string): number {
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

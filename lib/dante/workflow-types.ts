// lib/dante/workflow-types.ts
//
// Step + graph schema for Dante workflows. Kept as a single module so
// the runner, the REST API, the React editor, and the AI generator
// all agree on shape.
//
// Phase 1 stored workflows as a linear `steps[]` array. Phase 2 adds
// a proper DAG (`graph: { nodes, edges }`) for the visual canvas. The
// legacy array is still accepted for backward compat — stepsToGraph()
// lays a linear list out as a column of nodes so existing workflows
// don't break. The runner always reads the graph.
//
// Values in node.config can reference other nodes' outputs with
// `{{steps.<id>.<path>}}` — the runner substitutes these before each
// node fires. See resolveTemplate() in workflow-runner.ts.

export type StepType =
  // Trigger nodes (exactly one per graph; defines how a run starts):
  | "trigger_manual"  // kicked off from the UI "Run" button
  | "trigger_cron"    // scheduled; config.cron = crontab expression
  | "trigger_webhook" // fires on POST to /api/dante/hooks/<token>
  // Action / flow-control nodes:
  | "http"            // fetch() against any URL
  | "openai"          // chat completion → emits `text`
  | "query_clients"   // Supabase select on contacts, with filters
  | "update_contact"  // Supabase update on a single contact
  | "send_email"      // Resend email
  | "condition"       // branches to outgoing `true` / `false` edges
  | "delay";          // pause N seconds

export interface BaseStep {
  id: string;
  type: StepType;
  name?: string;
  on_error?: "stop" | "continue";
}

export interface HttpStep extends BaseStep {
  type: "http";
  config: {
    url: string;
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    headers?: Record<string, string>;
    body?: unknown;
  };
}

export interface OpenAIStep extends BaseStep {
  type: "openai";
  config: {
    model?: string;      // default gpt-4o-mini
    system?: string;
    prompt: string;
    max_tokens?: number;
  };
}

export interface QueryClientsStep extends BaseStep {
  type: "query_clients";
  config: {
    // Simple filter DSL — optional equality on any column.
    filter?: Record<string, string>;
    limit?: number;
  };
}

export interface UpdateContactStep extends BaseStep {
  type: "update_contact";
  config: {
    contact_id: string;
    patch: Record<string, unknown>;
  };
}

export interface SendEmailStep extends BaseStep {
  type: "send_email";
  config: {
    to: string;
    subject: string;
    html?: string;
    text?: string;
  };
}

export interface ConditionStep extends BaseStep {
  type: "condition";
  config: {
    // Very small expression language: "{{steps.foo.text}} contains 'yes'"
    // or "{{steps.foo.score}} > 50". Evaluated in evaluateCondition().
    expression: string;
    on_false: "stop" | "continue";
  };
}

export interface DelayStep extends BaseStep {
  type: "delay";
  config: {
    seconds: number; // capped at 60 by the runner (long waits need a real queue)
  };
}

// ── Trigger nodes ──────────────────────────────────────────────
// Every graph must start from exactly one trigger node. For the
// runner, triggers are pass-throughs — their `config` is metadata
// for the scheduler (cron) or webhook dispatch (webhook), and the
// run's `input` is exposed via {{steps.<trigger_id>.input}}.

export interface TriggerManualStep extends BaseStep {
  type: "trigger_manual";
  config: Record<string, never>;
}

export interface TriggerCronStep extends BaseStep {
  type: "trigger_cron";
  config: {
    cron: string; // standard 5-field crontab, e.g. "0 9 * * *"
    timezone?: string;
  };
}

export interface TriggerWebhookStep extends BaseStep {
  type: "trigger_webhook";
  config: {
    // The token is generated server-side and stored in
    // dante_webhook_tokens — the node just references it for display.
    token?: string;
  };
}

export type WorkflowStep =
  | TriggerManualStep
  | TriggerCronStep
  | TriggerWebhookStep
  | HttpStep
  | OpenAIStep
  | QueryClientsStep
  | UpdateContactStep
  | SendEmailStep
  | ConditionStep
  | DelayStep;

// ── Graph model ────────────────────────────────────────────────
// React Flow speaks this shape natively. Each node carries its full
// step definition in `data.step`, so the editor doesn't need a side
// table to remember config.

export interface GraphNode {
  id: string;
  type: StepType;
  position: { x: number; y: number };
  data: {
    step: WorkflowStep;
  };
}

export interface GraphEdge {
  id: string;
  source: string;        // source node id
  target: string;        // target node id
  // Condition nodes emit two source handles: "true" and "false".
  // Everything else uses the default single handle (undefined).
  sourceHandle?: "true" | "false";
  targetHandle?: string;
}

export interface WorkflowGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

export interface WorkflowDefinition {
  id: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  trigger: { type: "manual" | "cron" | "webhook" };
  graph: WorkflowGraph;
}

export interface StepLogEntry {
  step_id: string;
  step_type: StepType;
  step_name: string;
  status: "success" | "error" | "skipped";
  started_at: string;
  finished_at: string;
  output?: unknown;
  error?: string;
}

export interface WorkflowRunResult {
  status: "success" | "error";
  log: StepLogEntry[];
  output: Record<string, unknown>; // keyed by step id
  error?: string;
}

// ── Legacy → graph migration ───────────────────────────────────
// Auto-converts a phase-1 linear `steps[]` into a graph the canvas
// can render. Prepended with a manual-trigger node so every graph
// has a proper entry point, and laid out as a vertical column.

export function stepsToGraph(steps: WorkflowStep[] | null | undefined): WorkflowGraph {
  const arr = Array.isArray(steps) ? steps : [];

  // Trigger always at the top.
  const trigger: GraphNode = {
    id: "trigger",
    type: "trigger_manual",
    position: { x: 40, y: 40 },
    data: {
      step: { id: "trigger", type: "trigger_manual", name: "Manual trigger", config: {} },
    },
  };

  const nodes: GraphNode[] = [trigger];
  const edges: GraphEdge[] = [];
  let prevId = trigger.id;

  arr.forEach((step, i) => {
    const node: GraphNode = {
      id: step.id,
      type: step.type,
      position: { x: 40, y: 160 + i * 140 },
      data: { step },
    };
    nodes.push(node);
    edges.push({
      id: `${prevId}->${step.id}`,
      source: prevId,
      target: step.id,
    });
    prevId = step.id;
  });

  return { nodes, edges };
}

// Build a WorkflowDefinition from a DB row, tolerating either legacy
// `steps` or phase-2 `graph` shape. Used by the runner and the API.
export function definitionFromRow(row: {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger: unknown;
  graph?: unknown;
  steps?: unknown;
}): WorkflowDefinition {
  const graph: WorkflowGraph = (() => {
    const g = row.graph as WorkflowGraph | undefined;
    if (g && Array.isArray(g.nodes) && g.nodes.length > 0) {
      return { nodes: g.nodes, edges: Array.isArray(g.edges) ? g.edges : [], viewport: g.viewport };
    }
    // Fall back to the legacy linear shape.
    return stepsToGraph(row.steps as WorkflowStep[] | undefined);
  })();

  const trigger = (row.trigger && typeof row.trigger === "object")
    ? (row.trigger as { type: "manual" | "cron" | "webhook" })
    : { type: "manual" as const };

  return {
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    trigger,
    graph,
  };
}

// lib/dante/n8n-types.ts
//
// TypeScript types for n8n workflow JSON and REST API responses.
// These mirror the n8n public API schema and are used by the bridge
// module (n8n-bridge.ts) and the workflow AI generator.
//
// Reference: https://docs.n8n.io/api/api-reference/

// ── n8n Workflow JSON ────────────────────────────────────────

/** Position on the n8n canvas. */
export interface N8nNodePosition {
  0: number; // x
  1: number; // y
}

/** Credential reference attached to a node. */
export interface N8nCredentialRef {
  id: string;
  name: string;
}

/** A single node in an n8n workflow. */
export interface N8nNode {
  id: string;
  name: string;
  type: string;           // e.g. "n8n-nodes-base.httpRequest" or "n8n-nodes-drift-cre.driftQueryContacts"
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, N8nCredentialRef>;
  /** Per-node error handling: stopWorkflow | continueRegularOutput | continueErrorOutput */
  onError?: "stopWorkflow" | "continueRegularOutput" | "continueErrorOutput";
  /** Per-node retry config */
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  notes?: string;
  notesInFlow?: boolean;
  disabled?: boolean;
}

/** A single connection target. */
export interface N8nConnectionTarget {
  node: string;   // target node name
  type: "main";
  index: number;  // output/input index (0 for single-output nodes)
}

/**
 * n8n connections object. Keyed by source node name.
 * Each source has a "main" array of arrays — one array per output handle.
 * Each inner array lists the connections from that output.
 *
 * Example:
 * {
 *   "Manual Trigger": { "main": [[ { "node": "HTTP Request", "type": "main", "index": 0 } ]] },
 *   "IF": { "main": [
 *     [ { "node": "True Branch", "type": "main", "index": 0 } ],
 *     [ { "node": "False Branch", "type": "main", "index": 0 } ]
 *   ]}
 * }
 */
export type N8nConnections = Record<string, {
  main: N8nConnectionTarget[][];
}>;

/** Workflow-level settings. */
export interface N8nWorkflowSettings {
  executionOrder?: "v1";
  saveDataErrorExecution?: "all" | "none";
  saveDataSuccessExecution?: "all" | "none";
  saveManualExecutions?: boolean;
  callerPolicy?: "any" | "none" | "workflowsFromAList";
  timezone?: string;
  [key: string]: unknown;
}

/** Full n8n workflow JSON definition. */
export interface N8nWorkflowJSON {
  name: string;
  nodes: N8nNode[];
  connections: N8nConnections;
  active?: boolean;
  settings?: N8nWorkflowSettings;
  tags?: Array<{ id?: string; name: string }>;
  /** Static data for trigger state (managed by n8n, not user-editable). */
  staticData?: unknown;
}

// ── n8n REST API Response Types ──────────────────────────────

/** Workflow as returned by the n8n API (includes server-managed fields). */
export interface N8nWorkflowResponse extends N8nWorkflowJSON {
  id: string;
  createdAt: string;
  updatedAt: string;
  versionId?: string;
}

/** Summary returned by list endpoints. */
export interface N8nWorkflowSummary {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  tags: Array<{ id: string; name: string }>;
}

/** n8n execution status values. */
export type N8nExecutionStatus =
  | "new"
  | "running"
  | "success"
  | "error"
  | "canceled"
  | "crashed"
  | "waiting"
  | "unknown";

/** Per-node execution data. */
export interface N8nNodeExecutionData {
  startTime: number;
  executionTime: number;
  executionStatus?: "success" | "error";
  source?: Array<{ previousNode: string }>;
  data?: {
    main?: Array<Array<{
      json: Record<string, unknown>;
      binary?: Record<string, unknown>;
    }>>;
  };
  error?: {
    message: string;
    description?: string;
    stack?: string;
  };
}

/** Full execution as returned by the n8n API. */
export interface N8nExecution {
  id: string;
  finished: boolean;
  mode: "manual" | "trigger" | "webhook" | "retry" | "cli" | "integrated" | "internal";
  startedAt: string;
  stoppedAt?: string;
  workflowId: string;
  status: N8nExecutionStatus;
  /** Only present when queried with includeData=true. */
  data?: {
    resultData?: {
      runData?: Record<string, N8nNodeExecutionData[]>;
      lastNodeExecuted?: string;
      error?: {
        message: string;
        stack?: string;
      };
    };
  };
  waitTill?: string | null;
}

/** Tag as returned by the n8n API. */
export interface N8nTag {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** Paginated list response from n8n. */
export interface N8nPaginatedResponse<T> {
  data: T[];
  nextCursor?: string;
}

// ── Drift-to-n8n Mapping ─────────────────────────────────────

/** Maps Drift step types to their n8n node type equivalents. */
export const DRIFT_TO_N8N_NODE_TYPE: Record<string, string> = {
  // Built-in n8n nodes (no custom code needed)
  trigger_manual:    "n8n-nodes-base.webhook",
  trigger_cron:      "n8n-nodes-base.scheduleTrigger",
  trigger_at:        "n8n-nodes-base.scheduleTrigger",
  trigger_webhook:   "n8n-nodes-base.webhook",
  http:              "n8n-nodes-base.httpRequest",
  openai:            "@n8n/n8n-nodes-langchain.openAi",
  code:              "n8n-nodes-base.code",
  condition:         "n8n-nodes-base.if",
  switch:            "n8n-nodes-base.switch",
  delay:             "n8n-nodes-base.wait",
  for_each:          "n8n-nodes-base.splitInBatches",
  transform:         "n8n-nodes-base.code",
  send_email:        "n8n-nodes-base.httpRequest",  // Resend REST (SMTP blocked on Railway)
  send_sms:          "n8n-nodes-base.twilio",
  sub_workflow:      "n8n-nodes-base.executeWorkflow",

  // Custom Drift CRE nodes
  query_clients:     "n8n-nodes-drift-cre.driftQueryContacts",
  update_contact:    "n8n-nodes-drift-cre.driftUpdateContact",
  query_properties:  "n8n-nodes-drift-cre.driftQueryProperties",
  query_listings:    "n8n-nodes-drift-cre.driftQueryListings",
  query_offers:      "n8n-nodes-drift-cre.driftQueryOffers",
  lease_lookup:      "n8n-nodes-drift-cre.driftLeaseLookup",
  archive_lookup:    "n8n-nodes-drift-cre.driftVaultSearch",
  web_search:        "n8n-nodes-drift-cre.driftWebSearch",
  due_diligence:     "n8n-nodes-drift-cre.driftDueDiligence",
  generate_document: "n8n-nodes-drift-cre.driftGenerateDocument",
  agent:             "n8n-nodes-drift-cre.driftAiAgent",
  approval:          "n8n-nodes-drift-cre.driftApprovalGate",
};

// ── Execution Callback ───────────────────────────────────────

/** Payload pushed from the "Report to Drift" final node in every n8n workflow. */
export interface N8nExecutionCallback {
  n8n_execution_id: string;
  n8n_workflow_id: string;
  status: "success" | "error";
  started_at: string;
  finished_at: string;
  result_summary?: Record<string, unknown>;
  error_message?: string;
}

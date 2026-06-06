// lib/dante/n8n-bridge.ts
//
// Thin wrapper over the n8n REST API (v1). This is the sole integration
// point between Drift and the self-hosted n8n instance. All workflow
// CRUD, execution triggers, and status queries go through here.
//
// Auth: X-N8N-API-KEY header. The key lives in DRIFT_N8N_API_KEY env var.
// Base URL: DRIFT_N8N_BASE_URL (e.g. https://n8n.driftai.studio)
//
// Two execution modes per advisory board requirement:
//   - executeAsync: webhook trigger, returns immediately, results pushed
//     via "Report to Drift" final node. Use for background workflows.
//   - executeSync: API trigger with includeData=true, waits for completion.
//     Use when Dante needs the result to respond to the user.

import { log as rootLog } from "@/lib/logging";
import type {
  N8nWorkflowJSON,
  N8nWorkflowResponse,
  N8nWorkflowSummary,
  N8nExecution,
  N8nExecutionStatus,
  N8nTag,
  N8nPaginatedResponse,
} from "./n8n-types";

const n8nLog = rootLog.child({ component: "n8n-bridge" });

// ── Configuration ────────────────────────────────────────────

function getBaseUrl(): string {
  const url = process.env.DRIFT_N8N_BASE_URL;
  if (!url) throw new Error("n8n-bridge: DRIFT_N8N_BASE_URL is not set");
  return url.replace(/\/$/, "");
}

function getApiKey(): string {
  const key = process.env.DRIFT_N8N_API_KEY;
  if (!key) throw new Error("n8n-bridge: DRIFT_N8N_API_KEY is not set");
  return key;
}

// ── HTTP Helpers ─────────────────────────────────────────────

interface FetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT = 10_000; // 10s per board requirement
const SYNC_EXEC_TIMEOUT = 120_000; // 120s for sync execution

async function n8nFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { method = "GET", body, timeoutMs = DEFAULT_TIMEOUT } = opts;
  const url = `${getBaseUrl()}/api/v1${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "X-N8N-API-KEY": getApiKey(),
      "Accept": "application/json",
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const err = new Error(`n8n API ${method} ${path} returned ${response.status}: ${text}`);
      n8nLog.error("n8n API error", { method, path, status: response.status, body: text });
      throw err;
    }

    // Some endpoints return 204 No Content
    if (response.status === 204) return undefined as T;

    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Retry a fetch once on timeout or 5xx. */
async function n8nFetchWithRetry<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  try {
    return await n8nFetch<T>(path, opts);
  } catch (err) {
    const isRetryable =
      (err instanceof Error && err.name === "AbortError") ||
      (err instanceof Error && err.message.includes("returned 5"));
    if (!isRetryable) throw err;

    n8nLog.warn("n8n API call failed, retrying once", { path, err: String(err) });
    return n8nFetch<T>(path, opts);
  }
}

// ── Workflow CRUD ────────────────────────────────────────────

/**
 * Create a workflow in n8n. Returns the n8n-assigned workflow ID.
 * The workflow is created inactive by default.
 */
export async function createWorkflow(json: N8nWorkflowJSON): Promise<string> {
  const payload = { ...json, active: json.active ?? false };
  const result = await n8nFetchWithRetry<N8nWorkflowResponse>("/workflows", {
    method: "POST",
    body: payload,
  });
  n8nLog.info("created n8n workflow", { n8nId: result.id, name: json.name });
  return result.id;
}

/** Update an existing workflow's definition. */
export async function updateWorkflow(id: string, json: N8nWorkflowJSON): Promise<void> {
  await n8nFetchWithRetry<N8nWorkflowResponse>(`/workflows/${id}`, {
    method: "PUT",
    body: json,
  });
  n8nLog.info("updated n8n workflow", { n8nId: id, name: json.name });
}

/** Delete a workflow from n8n. */
export async function deleteWorkflow(id: string): Promise<void> {
  await n8nFetchWithRetry<void>(`/workflows/${id}`, { method: "DELETE" });
  n8nLog.info("deleted n8n workflow", { n8nId: id });
}

/** Activate (publish) a workflow so its triggers fire. */
export async function activateWorkflow(id: string): Promise<void> {
  await n8nFetchWithRetry<N8nWorkflowResponse>(`/workflows/${id}/activate`, {
    method: "POST",
  });
  n8nLog.info("activated n8n workflow", { n8nId: id });
}

/** Deactivate a workflow (triggers stop firing, but definition stays). */
export async function deactivateWorkflow(id: string): Promise<void> {
  await n8nFetchWithRetry<N8nWorkflowResponse>(`/workflows/${id}/deactivate`, {
    method: "POST",
  });
  n8nLog.info("deactivated n8n workflow", { n8nId: id });
}

/** Get a single workflow definition by ID. */
export async function getWorkflow(id: string): Promise<N8nWorkflowResponse> {
  return n8nFetchWithRetry<N8nWorkflowResponse>(`/workflows/${id}`);
}

/**
 * List workflows, optionally filtered by tags.
 * Handles cursor-based pagination to fetch all results.
 */
export async function listWorkflows(
  tags?: string[],
): Promise<N8nWorkflowSummary[]> {
  const all: N8nWorkflowSummary[] = [];
  let cursor: string | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const params = new URLSearchParams();
    params.set("limit", "250");
    if (cursor) params.set("cursor", cursor);
    if (tags?.length) params.set("tags", tags.join(","));

    const page = await n8nFetchWithRetry<N8nPaginatedResponse<N8nWorkflowSummary>>(
      `/workflows?${params.toString()}`,
    );
    all.push(...page.data);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }

  return all;
}

// ── Execution ────────────────────────────────────────────────

/**
 * Trigger a workflow asynchronously via its production webhook.
 * Returns immediately with the execution ID. Results are pushed to
 * Drift via the "Report to Drift" final node in the workflow.
 *
 * Use for: background workflows (lease alerts, drip campaigns, cron jobs).
 */
export async function executeAsync(
  webhookPath: string,
  data?: Record<string, unknown>,
): Promise<string> {
  const url = `${getBaseUrl()}/webhook/${webhookPath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data || {}),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`n8n webhook POST ${webhookPath} returned ${response.status}: ${text}`);
    }

    const result = await response.json();
    const executionId = result?.executionId || result?.id || "unknown";
    n8nLog.info("triggered async execution", { webhookPath, executionId });
    return String(executionId);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Execute a workflow synchronously via the n8n API. Waits for completion
 * and returns the full execution result including per-node data.
 *
 * Use for: workflows where Dante needs the result to respond to the user
 * (deal scoring, document generation, vault analysis).
 *
 * Timeout: configurable, defaults to 120s.
 */
export async function executeSync(
  webhookPath: string,
  data?: Record<string, unknown>,
  timeoutMs = SYNC_EXEC_TIMEOUT,
): Promise<N8nExecution> {
  // Use the webhook with "When Last Node Finishes" response mode.
  // The webhook call blocks until the workflow completes and returns
  // the final output, which we then fetch as a full execution.
  const url = `${getBaseUrl()}/webhook/${webhookPath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data || {}),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`n8n sync webhook POST ${webhookPath} returned ${response.status}: ${text}`);
    }

    const result = await response.json();

    // If the webhook returned an execution ID, fetch full execution data.
    // If it returned the workflow output directly (response mode), wrap it.
    if (result?.executionId) {
      return getExecution(result.executionId, true);
    }

    // Webhook returned output directly -- construct a synthetic execution object
    return {
      id: "sync-" + Date.now(),
      finished: true,
      mode: "webhook",
      startedAt: new Date().toISOString(),
      stoppedAt: new Date().toISOString(),
      workflowId: "",
      status: "success",
      data: {
        resultData: {
          runData: {
            "webhook-output": [{
              startTime: Date.now(),
              executionTime: 0,
              executionStatus: "success",
              data: { main: [[{ json: result }]] },
            }],
          },
        },
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Execute a workflow via the n8n REST API (not via webhook).
 * Use for workflows that have manualTrigger or scheduleTrigger.
 * Calls POST /workflows/{id}/run which triggers an immediate execution.
 *
 * Returns the execution ID. The "Report to Drift" final node pushes
 * results back via the callback endpoint.
 */
export async function executeWorkflowById(
  workflowId: string,
  data?: Record<string, unknown>,
): Promise<string> {
  const result = await n8nFetchWithRetry<{ data: { executionId: string } }>(
    `/workflows/${workflowId}/run`,
    {
      method: "POST",
      body: data ? { data } : undefined,
      timeoutMs: SYNC_EXEC_TIMEOUT,
    },
  );
  const executionId = result?.data?.executionId || "unknown";
  n8nLog.info("triggered API execution", { workflowId, executionId });
  return String(executionId);
}

// ── Execution Queries ────────────────────────────────────────

/**
 * Get a single execution by ID.
 * Pass includeData=true to get per-node input/output (required for
 * execution traces in the frontend -- ships Phase 1 per board requirement).
 */
export async function getExecution(
  id: string,
  includeData = false,
): Promise<N8nExecution> {
  const params = includeData ? "?includeData=true" : "";
  return n8nFetchWithRetry<N8nExecution>(`/executions/${id}${params}`);
}

/**
 * List executions, optionally filtered by workflow ID and/or status.
 * Returns most recent first.
 */
export async function listExecutions(opts?: {
  workflowId?: string;
  status?: N8nExecutionStatus;
  limit?: number;
}): Promise<N8nExecution[]> {
  const params = new URLSearchParams();
  if (opts?.workflowId) params.set("workflowId", opts.workflowId);
  if (opts?.status) params.set("status", opts.status);
  params.set("limit", String(opts?.limit || 50));

  const result = await n8nFetchWithRetry<N8nPaginatedResponse<N8nExecution>>(
    `/executions?${params.toString()}`,
  );
  return result.data;
}

/** Retry a failed execution. */
export async function retryExecution(id: string): Promise<void> {
  await n8nFetchWithRetry<unknown>(`/executions/${id}/retry`, { method: "POST" });
  n8nLog.info("retried execution", { executionId: id });
}

/** Stop a running execution. */
export async function stopExecution(id: string): Promise<void> {
  await n8nFetchWithRetry<unknown>(`/executions/${id}/stop`, { method: "POST" });
  n8nLog.info("stopped execution", { executionId: id });
}

// ── Tags (Workspace Isolation) ───────────────────────────────

/** Create a tag. Returns the tag ID. */
export async function createTag(name: string): Promise<string> {
  const result = await n8nFetchWithRetry<N8nTag>("/tags", {
    method: "POST",
    body: { name },
  });
  return result.id;
}

/** List all tags. */
export async function listTags(): Promise<N8nTag[]> {
  const result = await n8nFetchWithRetry<N8nPaginatedResponse<N8nTag>>("/tags");
  return result.data;
}

/**
 * Get or create a workspace tag. Format: "workspace:<workspaceId>".
 * Caches the tag ID for the lifetime of the process.
 */
const tagCache = new Map<string, string>();

export async function ensureWorkspaceTag(workspaceId: string): Promise<string> {
  const tagName = `workspace:${workspaceId}`;
  const cached = tagCache.get(tagName);
  if (cached) return cached;

  const existing = await listTags();
  const found = existing.find((t) => t.name === tagName);
  if (found) {
    tagCache.set(tagName, found.id);
    return found.id;
  }

  const newId = await createTag(tagName);
  tagCache.set(tagName, newId);
  n8nLog.info("created workspace tag", { workspaceId, tagId: newId });
  return newId;
}

// ── Workspace-Scoped Helpers ─────────────────────────────────

/**
 * List all workflows belonging to a workspace (filtered by workspace tag).
 */
export async function listWorkspaceWorkflows(
  workspaceId: string,
): Promise<N8nWorkflowSummary[]> {
  const tagName = `workspace:${workspaceId}`;
  return listWorkflows([tagName]);
}

/**
 * Create a workflow in n8n tagged with the workspace.
 * Returns the n8n workflow ID.
 */
export async function createWorkspaceWorkflow(
  workspaceId: string,
  json: N8nWorkflowJSON,
): Promise<string> {
  const tagName = `workspace:${workspaceId}`;
  const taggedJson: N8nWorkflowJSON = {
    ...json,
    tags: [...(json.tags || []), { name: tagName }],
  };
  return createWorkflow(taggedJson);
}

// ── Health Check ─────────────────────────────────────────────

/** Verify n8n is reachable and the API key is valid. */
export async function healthCheck(): Promise<{
  ok: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    await n8nFetch<unknown>("/workflows?limit=1", { timeoutMs: 5_000 });
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

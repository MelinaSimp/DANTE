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

// ── n8n Credential Mapping ───────────────────────────────────
// Real credential IDs from the production n8n instance. Templates use
// placeholder IDs (e.g. "1") -- this map replaces them before push.
// Override via DRIFT_N8N_CREDENTIALS env var (JSON object mapping
// credential type to {id, name}) if the instance changes.
//
// driftCreApi is deliberately NOT in the default map: it embeds a
// workspaceId, so every workspace needs its own credential (see
// ensureWorkspaceCredential). A driftCreApi entry in the env override
// still wins everywhere -- that is the single-tenant escape hatch.

const DEFAULT_CREDENTIAL_MAP: Record<string, { id: string; name: string }> = {
  smtp: { id: "ztouaxmhahC8PIgH", name: "Resend SMTP" },
  openAiApi: { id: "5MaeTxEbGKeVR8Sk", name: "OpenAI" },
};

function getCredentialMap(): Record<string, { id: string; name: string }> {
  const override = process.env.DRIFT_N8N_CREDENTIALS;
  if (override) {
    try { return JSON.parse(override); } catch { /* fall through */ }
  }
  return DEFAULT_CREDENTIAL_MAP;
}

/**
 * Replace placeholder credential IDs on all nodes with real n8n IDs.
 * Call BEFORE pushing to n8n so activation succeeds.
 *
 * Prefer patchGraphCredentialsForWorkspace, which also resolves the
 * workspace-scoped driftCreApi credential. This sync variant only maps
 * shared credential types (smtp, openAiApi) plus whatever the env
 * override supplies.
 */
export function patchGraphCredentials(
  nodes: Array<{ credentials?: unknown }>,
  overrides?: Record<string, { id: string; name: string }>,
): void {
  const credMap = { ...getCredentialMap(), ...overrides };
  for (const node of nodes) {
    const creds = node.credentials as Record<string, { id: string; name: string }> | undefined;
    if (!creds) continue;
    for (const [credType, ref] of Object.entries(creds)) {
      const real = credMap[credType];
      if (real && ref.id !== real.id) {
        creds[credType] = { ...real };
      }
    }
    // Also add missing credentials for known node types
    const nodeType = (node as { type?: string }).type || "";
    if (nodeType === "n8n-nodes-base.emailSend" && !creds.smtp && credMap.smtp) {
      creds.smtp = { ...credMap.smtp };
    }
  }
}

/**
 * Workspace-aware credential patch: resolves (creating if needed) the
 * workspace's own driftCreApi credential and applies it along with the
 * shared credential map. Use this at every push/update site.
 *
 * Throws if the graph references driftCreApi and the workspace
 * credential cannot be resolved -- executing against another tenant's
 * credential is worse than a failed push.
 */
export async function patchGraphCredentialsForWorkspace(
  nodes: Array<{ credentials?: unknown }>,
  workspaceId: string,
): Promise<void> {
  const needsDriftCred = nodes.some((n) => {
    const creds = n.credentials as Record<string, unknown> | undefined;
    return !!creds?.driftCreApi;
  });
  const overrides = needsDriftCred
    ? { driftCreApi: await ensureWorkspaceCredential(workspaceId) }
    : undefined;
  patchGraphCredentials(nodes, overrides);
}

// ── Per-Workspace Credentials ────────────────────────────────
// Each workspace gets its own driftCreApi credential in n8n so cloned
// workflows execute Drift API calls against the right tenant. The n8n
// public API cannot list credentials, so the mapping is persisted on
// workspaces.n8n_credential_id and cached per process.

const workspaceCredCache = new Map<string, { id: string; name: string }>();

function workspaceCredName(workspaceId: string): string {
  return `Drift CRE - ws:${workspaceId}`;
}

/** Create a credential in n8n. Returns its ID. No retry -- a retried
 *  POST after an ambiguous timeout would create a duplicate. */
export async function createCredential(
  name: string,
  type: string,
  data: Record<string, unknown>,
): Promise<string> {
  const result = await n8nFetch<{ id: string }>("/credentials", {
    method: "POST",
    body: { name, type, data },
  });
  n8nLog.info("created n8n credential", { credentialId: result.id, name, type });
  return result.id;
}

/** Delete a credential from n8n (best-effort cleanup). */
export async function deleteCredential(id: string): Promise<void> {
  await n8nFetch<void>(`/credentials/${id}`, { method: "DELETE" });
  n8nLog.info("deleted n8n credential", { credentialId: id });
}

/**
 * Get or create the workspace's driftCreApi credential in n8n.
 *
 * Resolution order:
 *   1. DRIFT_N8N_CREDENTIALS env override (if it defines driftCreApi)
 *   2. In-process cache
 *   3. workspaces.n8n_credential_id in the Drift DB
 *   4. Create via the n8n API, persist the ID back to the workspace row
 */
export async function ensureWorkspaceCredential(
  workspaceId: string,
): Promise<{ id: string; name: string }> {
  // Env override is the single-tenant / dev escape hatch
  const override = process.env.DRIFT_N8N_CREDENTIALS;
  if (override) {
    try {
      const parsed = JSON.parse(override) as Record<string, { id: string; name: string }>;
      if (parsed.driftCreApi?.id) return { ...parsed.driftCreApi };
    } catch { /* fall through */ }
  }

  const cached = workspaceCredCache.get(workspaceId);
  if (cached) return { ...cached };

  // Dynamic import keeps the bridge usable in scripts that only have
  // n8n env configured (no Supabase).
  const { supabaseAdmin } = await import("@/lib/supabase/admin");

  const { data: ws, error: readErr } = await supabaseAdmin
    .from("workspaces")
    .select("n8n_credential_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (readErr) {
    throw new Error(`ensureWorkspaceCredential: workspace lookup failed -- ${readErr.message}`);
  }
  if (!ws) {
    throw new Error(`ensureWorkspaceCredential: workspace ${workspaceId} not found`);
  }

  const name = workspaceCredName(workspaceId);
  const storedId = (ws as { n8n_credential_id?: string | null }).n8n_credential_id;
  if (storedId) {
    const cred = { id: storedId, name };
    workspaceCredCache.set(workspaceId, cred);
    return { ...cred };
  }

  // Not provisioned yet -- create in n8n. The credential carries the
  // same Supabase project as the app plus the tenant's workspace ID.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("ensureWorkspaceCredential: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  }
  const newId = await createCredential(name, "driftCreApi", {
    supabaseUrl,
    supabaseKey,
    workspaceId,
    // n8n-core field on every credential schema; "none" blocks the
    // generic HTTP Request tool from borrowing this credential. Drift
    // nodes read it via getCredentials, which is unaffected.
    allowedHttpRequestDomains: "none",
  });

  // Persist; guard against a concurrent create winning the race.
  const { data: updated, error: writeErr } = await supabaseAdmin
    .from("workspaces")
    .update({ n8n_credential_id: newId })
    .eq("id", workspaceId)
    .is("n8n_credential_id", null)
    .select("n8n_credential_id");
  if (writeErr) {
    throw new Error(`ensureWorkspaceCredential: failed to store credential ID -- ${writeErr.message}`);
  }
  if (!updated || updated.length === 0) {
    // Someone else stored one first -- use theirs, drop ours.
    const { data: fresh } = await supabaseAdmin
      .from("workspaces")
      .select("n8n_credential_id")
      .eq("id", workspaceId)
      .maybeSingle();
    const winnerId = (fresh as { n8n_credential_id?: string | null } | null)?.n8n_credential_id;
    if (winnerId && winnerId !== newId) {
      try { await deleteCredential(newId); } catch { /* orphan is harmless */ }
      const cred = { id: winnerId, name };
      workspaceCredCache.set(workspaceId, cred);
      return { ...cred };
    }
  }

  const cred = { id: newId, name };
  workspaceCredCache.set(workspaceId, cred);
  n8nLog.info("provisioned workspace n8n credential", { workspaceId, credentialId: newId });
  return { ...cred };
}

// ── Configuration ────────────────────────────────────────────

function getBaseUrl(): string {
  const url = process.env.DRIFT_N8N_BASE_URL;
  if (!url) throw new Error("n8n-bridge: DRIFT_N8N_BASE_URL is not set");
  return url.replace(/\/$/, "");
}

/**
 * Returns auth headers for the n8n API. Supports two modes:
 *   1. API key (DRIFT_N8N_API_KEY) -- sent as X-N8N-API-KEY header
 *   2. Basic auth (DRIFT_N8N_BASIC_AUTH=user:pass) -- sent as Authorization header
 * At least one must be set.
 */
function getAuthHeaders(): Record<string, string> {
  const apiKey = process.env.DRIFT_N8N_API_KEY;
  if (apiKey) return { "X-N8N-API-KEY": apiKey };

  const basicAuth = process.env.DRIFT_N8N_BASIC_AUTH;
  if (basicAuth) {
    const encoded = Buffer.from(basicAuth).toString("base64");
    return { Authorization: `Basic ${encoded}` };
  }

  throw new Error("n8n-bridge: DRIFT_N8N_API_KEY or DRIFT_N8N_BASIC_AUTH must be set");
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
      ...getAuthHeaders(),
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
  // n8n v1 API treats `active` and `tags` as read-only on create -- strip them
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { active, tags, ...payload } = json as N8nWorkflowJSON & { active?: boolean; tags?: unknown[] };
  // n8n requires `settings` even if empty
  if (!payload.settings) payload.settings = {};
  const result = await n8nFetchWithRetry<N8nWorkflowResponse>("/workflows", {
    method: "POST",
    body: payload,
  });
  n8nLog.info("created n8n workflow", { n8nId: result.id, name: json.name });

  // Apply tags after creation if provided (requires tag IDs, not names)
  if (tags && Array.isArray(tags) && tags.length > 0) {
    try {
      // Resolve tag names to IDs
      const existingTags = await listTags();
      const tagIds: Array<{ id: string }> = [];
      for (const tag of tags) {
        const tagName = typeof tag === "string" ? tag : (tag as { name?: string })?.name;
        if (!tagName) continue;
        let found = existingTags.find((t) => t.name === tagName);
        if (!found) {
          try {
            const newId = await createTag(tagName);
            found = { id: newId, name: tagName, createdAt: "", updatedAt: "" };
          } catch {
            // Tag might have been created concurrently -- refetch
            const refreshed = await listTags();
            found = refreshed.find((t) => t.name === tagName);
          }
        }
        if (found) tagIds.push({ id: found.id });
      }
      if (tagIds.length > 0) {
        await n8nFetchWithRetry<unknown>(`/workflows/${result.id}/tags`, {
          method: "PUT",
          body: tagIds,
        });
      }
    } catch (tagErr) {
      n8nLog.warn("failed to apply tags to workflow", {
        n8nId: result.id,
        err: tagErr instanceof Error ? tagErr.message : String(tagErr),
      });
      // Non-fatal -- workflow was created, just not tagged
    }
  }

  // If the workflow should be active, try to activate it (non-fatal)
  if (active) {
    try {
      await activateWorkflow(result.id);
    } catch (activateErr) {
      n8nLog.warn("failed to activate workflow after creation (non-fatal)", {
        n8nId: result.id,
        err: activateErr instanceof Error ? activateErr.message : String(activateErr),
      });
    }
  }

  return result.id;
}

/** Update an existing workflow's definition. */
export async function updateWorkflow(id: string, json: N8nWorkflowJSON): Promise<void> {
  await n8nFetchWithRetry<N8nWorkflowResponse>(`/workflows/${id}`, {
    method: "PUT",
    body: json,
  });
  n8nLog.info("updated n8n workflow", { n8nId: id, name: json.name });

  // n8n does not reliably re-register production webhooks after a PUT —
  // the workflow can report active:true while its webhook 404s. Cycle
  // deactivate→activate to force re-registration. Best-effort: a failure
  // here must not fail the update itself.
  try {
    await reactivateWorkflow(id);
  } catch (err) {
    n8nLog.warn("failed to reactivate workflow after update (non-fatal)", {
      n8nId: id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Force webhook re-registration by cycling deactivate → activate.
 * Safe to call on an inactive workflow (deactivate is then a no-op
 * server-side, and activate brings it up).
 */
export async function reactivateWorkflow(id: string): Promise<void> {
  try {
    await deactivateWorkflow(id);
  } catch {
    // Already inactive or transient error — activation below decides.
  }
  await activateWorkflow(id);
  n8nLog.info("reactivated n8n workflow (webhook re-registration)", { n8nId: id });
}

/** Delete a workflow from n8n. */
export async function deleteWorkflow(id: string): Promise<void> {
  await n8nFetchWithRetry<void>(`/workflows/${id}`, { method: "DELETE" });
  n8nLog.info("deleted n8n workflow", { n8nId: id });
}

/** Activate (publish) a workflow so its triggers fire. */
export async function activateWorkflow(id: string): Promise<void> {
  // Try POST /activate first (n8n v1.50+), fall back to PATCH with
  // { active: true } for older versions (Railway self-hosted, etc.)
  try {
    await n8nFetchWithRetry<N8nWorkflowResponse>(`/workflows/${id}/activate`, {
      method: "POST",
    });
  } catch {
    // Fallback: PATCH the workflow with active: true
    await n8nFetchWithRetry<N8nWorkflowResponse>(`/workflows/${id}`, {
      method: "PATCH",
      body: { active: true },
    });
  }
  n8nLog.info("activated n8n workflow", { n8nId: id });
}

/** Deactivate a workflow (triggers stop firing, but definition stays). */
export async function deactivateWorkflow(id: string): Promise<void> {
  try {
    await n8nFetchWithRetry<N8nWorkflowResponse>(`/workflows/${id}/deactivate`, {
      method: "POST",
    });
  } catch {
    await n8nFetchWithRetry<N8nWorkflowResponse>(`/workflows/${id}`, {
      method: "PATCH",
      body: { active: false },
    });
  }
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
 *
 * Also enforces the workspace's own driftCreApi credential on every
 * node that references one -- a backstop so no push path can ship a
 * workflow pinned to another tenant's credential.
 */
export async function createWorkspaceWorkflow(
  workspaceId: string,
  json: N8nWorkflowJSON,
): Promise<string> {
  await patchGraphCredentialsForWorkspace(json.nodes || [], workspaceId);
  const tagName = `workspace:${workspaceId}`;
  const taggedJson: N8nWorkflowJSON = {
    ...json,
    tags: [...(json.tags || []), { name: tagName }],
  };
  return createWorkflow(taggedJson);
}

// ── Webhook Trigger Management ──────────────────────────────

/**
 * Ensure a graph has a webhook trigger with the given path.
 * Handles every case:
 *   - webhook present -> fix its path (+ webhookId)
 *   - manualTrigger -> replace with webhook (lossless; the n8n UI's
 *     manual trigger is unreachable from Drift)
 *   - scheduleTrigger -> KEEP the schedule and add a webhook alongside,
 *     mirroring the schedule's outgoing connections, so cron workflows
 *     still fire on schedule AND can be run on demand
 *   - no trigger at all -> add a webhook wired to the first action node
 *
 * Mutates nodes (and connections, when adding a trigger) in place.
 * Call this BEFORE pushing to n8n so the webhook registers on activation.
 */
export function patchGraphTrigger(
  nodes: Array<{ id: string; name: string; type: string; typeVersion?: number; position?: number[]; parameters?: unknown; webhookId?: string }>,
  webhookPath: string,
  connections?: Record<string, { main: Array<Array<{ node: string; type: string; index: number }>> }>,
): void {
  // n8n's production-webhook registry requires the node-level `webhookId`
  // property. Nodes created in the n8n UI get one automatically; nodes
  // pushed via the REST API do NOT — and without it the workflow
  // activates (active: true) while its webhook silently never registers,
  // so every POST /webhook/{path} 404s. Always ensure one is set.
  const ensureWebhookId = (node: { webhookId?: string }) => {
    if (!node.webhookId) node.webhookId = crypto.randomUUID();
  };

  let scheduleTrigger: (typeof nodes)[number] | null = null;
  let manualTriggerIdx = -1;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const type = String(node.type || "");

    // Already a webhook -- just fix the path
    if (type === "n8n-nodes-base.webhook") {
      const p = (node.parameters || {}) as Record<string, unknown>;
      p.path = webhookPath;
      p.httpMethod = p.httpMethod || "POST";
      p.responseMode = p.responseMode || "onReceived";
      node.parameters = p;
      ensureWebhookId(node);
      return;
    }

    if (type === "n8n-nodes-base.scheduleTrigger" || type === "n8n-nodes-base.cron") {
      // A scheduled workflow must KEEP its schedule. The old behavior
      // replaced it with a webhook, which silently killed every cron
      // template ("Daily 9am ET" never fired again). Remember it and
      // add a webhook alongside below so manual "Execute" still works.
      if (!scheduleTrigger) scheduleTrigger = node;
      continue;
    }

    if ((type.includes("Trigger") || type.includes("trigger")) && manualTriggerIdx < 0) {
      manualTriggerIdx = i;
    }
  }

  // Manual trigger (no schedule elsewhere): converting it to a webhook is
  // lossless — manualTrigger only fires from the n8n UI, which Drift
  // users never see.
  if (!scheduleTrigger && manualTriggerIdx >= 0) {
    const node = nodes[manualTriggerIdx];
    const oldParams = (node.parameters || {}) as Record<string, unknown>;
    nodes[manualTriggerIdx] = {
      ...node,
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      webhookId: node.webhookId || crypto.randomUUID(),
      parameters: {
        path: webhookPath,
        httpMethod: "POST",
        responseMode: "onReceived",
        // Preserve input_fields for the Drift UI run dialog
        ...(oldParams.input_fields ? { input_fields: oldParams.input_fields } : {}),
      },
    };
    return;
  }

  // Schedule trigger present (or no trigger at all): add a webhook
  // trigger node so the workflow is also executable on demand.
  const webhookName = "Run on demand";
  const anchor = scheduleTrigger ?? nodes[0];
  const webhookNode = {
    id: "drift-webhook-trigger",
    name: webhookName,
    type: "n8n-nodes-base.webhook",
    typeVersion: 2,
    webhookId: crypto.randomUUID(),
    position: [
      (anchor?.position?.[0] ?? 80),
      (anchor?.position?.[1] ?? 80) + 180,
    ] as number[],
    parameters: {
      path: webhookPath,
      httpMethod: "POST",
      responseMode: "onReceived",
    },
  };
  nodes.unshift(webhookNode);

  // Mirror the schedule trigger's outgoing connections onto the webhook
  // so a manual run enters the graph at the same place a scheduled run
  // does. Without this the webhook would be an orphan node (and n8n
  // refuses to register webhooks on disconnected triggers).
  if (connections && scheduleTrigger && connections[scheduleTrigger.name]?.main) {
    connections[webhookName] = {
      main: connections[scheduleTrigger.name].main.map((outputs) =>
        outputs.map((c) => ({ ...c })),
      ),
    };
  } else if (connections && !scheduleTrigger) {
    // No trigger existed at all — wire the webhook to the first node
    // that isn't a trigger or the Report-to-Drift callback, so it
    // isn't an orphan (n8n skips webhook registration for those).
    const firstAction = nodes.find(
      (n) =>
        n !== webhookNode &&
        !String(n.type).toLowerCase().includes("trigger") &&
        n.type !== "n8n-nodes-base.webhook" &&
        n.name !== "Report to Drift",
    );
    if (firstAction) {
      connections[webhookName] = {
        main: [[{ node: firstAction.name, type: "main", index: 0 }]],
      };
    }
  }
}

/**
 * Ensure a workflow in n8n has a webhook trigger with the correct path
 * so it can be executed via `POST /webhook/{path}`.
 *
 * If the trigger is already a webhook with the right path, this is a no-op.
 * Otherwise it patches the trigger node, updates the workflow, and
 * reactivates it so n8n registers the new webhook URL.
 *
 * @param n8nWorkflowId  The n8n-side workflow ID
 * @param webhookPath    The path to set (typically the Drift workflow ID)
 */
export async function ensureWebhookTrigger(
  n8nWorkflowId: string,
  webhookPath: string,
): Promise<void> {
  const wf = await getWorkflow(n8nWorkflowId);
  const nodes = wf.nodes || [];

  // Prefer an existing webhook node; a schedule trigger must never be
  // consumed by this repair path (converting it used to silently kill
  // the workflow's cron firing).
  const webhookIdx = nodes.findIndex((n) => n.type === "n8n-nodes-base.webhook");

  if (webhookIdx >= 0) {
    const hook = nodes[webhookIdx] as typeof nodes[number] & { webhookId?: string };
    const params = (hook.parameters || {}) as Record<string, unknown>;
    // Already correct? Requires the node-level webhookId too — without it
    // n8n never registers the production webhook even when active.
    if (params.path === webhookPath && hook.webhookId) return;
    params.path = webhookPath;
    params.httpMethod = params.httpMethod || "POST";
    params.responseMode = params.responseMode || "onReceived";
    hook.parameters = params;
    if (!hook.webhookId) hook.webhookId = crypto.randomUUID();
  } else {
    // No webhook — run the same trigger-preserving logic used at push
    // time (converts a manual trigger, or adds a webhook beside a
    // schedule trigger and mirrors its connections).
    patchGraphTrigger(
      nodes as Parameters<typeof patchGraphTrigger>[0],
      webhookPath,
      (wf as unknown as { connections?: Parameters<typeof patchGraphTrigger>[2] }).connections,
    );
  }

  // Build update payload -- strip read-only fields
  const { id: _id, active: _active, ...updatePayload } = wf as N8nWorkflowResponse & { active?: boolean };
  updatePayload.nodes = nodes;

  await updateWorkflow(n8nWorkflowId, updatePayload as unknown as N8nWorkflowJSON);

  // Deactivate then activate to re-register the new webhook URL
  try {
    await deactivateWorkflow(n8nWorkflowId);
  } catch {
    // Might already be inactive
  }
  await activateWorkflow(n8nWorkflowId);

  n8nLog.info("ensured webhook trigger", { n8nWorkflowId, webhookPath });
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

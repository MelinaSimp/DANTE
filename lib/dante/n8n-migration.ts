// lib/dante/n8n-migration.ts
//
// Migrates active user workflows from the legacy Drift engine to n8n.
// Each workflow goes through: convert -> validate -> push -> dry-run -> update DB.
//
// The migration is per-workspace and fully resumable -- workflows that
// already have an n8n_workflow_id are skipped. Failures are logged but
// never block other workflows.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { log as rootLog } from "@/lib/logging";
import { convertDriftToN8n } from "./n8n-converter";
import * as n8nBridge from "./n8n-bridge";
import type { WorkflowGraph } from "./workflow-types";

const migLog = rootLog.child({ component: "n8n-migration" });

// ── Types ───────────────────────────────────────────────────────

export interface MigrationResult {
  workflowId: string;
  workflowName: string;
  status: "migrated" | "skipped" | "failed" | "dry_run_failed";
  n8nWorkflowId?: string;
  warnings?: string[];
  error?: string;
  dryRunResult?: DryRunResult;
}

export interface DryRunResult {
  success: boolean;
  nodeCount: number;
  connectionCount: number;
  triggerType: string;
  validationErrors: string[];
  /** n8n returned a valid workflow structure */
  n8nAccepted: boolean;
}

export interface MigrationReport {
  workspaceId: string;
  startedAt: string;
  completedAt: string;
  total: number;
  migrated: number;
  skipped: number;
  failed: number;
  dry_run_failed: number;
  results: MigrationResult[];
}

// ── Drift-wrapped n8n restructuring ─────────────────────────────
//
// Some workflows were stored with Drift graph structure (nodes[] +
// edges[]) but the node types are already n8n types (e.g.
// "n8n-nodes-base.webhook"). This happens when templates are cloned
// into a workspace. We need to restructure into proper n8n format
// (nodes[] with names + connections{}).

export function restructureDriftWrappedN8n(
  graph: Record<string, unknown>,
  workflowId: string,
): import("./n8n-types").N8nWorkflowJSON {
  const sourceNodes = graph.nodes as Array<Record<string, unknown>>;
  const sourceEdges = (graph.edges || []) as Array<{
    source: string;
    target: string;
  }>;

  // Build n8n nodes. The Drift wrapper stores n8n config under
  // data.step.config or data.step.parameters. The node name comes
  // from data.step.name, and position from data.position or position.
  const n8nNodes: Array<Record<string, unknown>> = [];
  const idToName = new Map<string, string>();

  for (const node of sourceNodes) {
    const step = (node.data as Record<string, unknown>)?.step as Record<string, unknown> | undefined;
    const nodeType = (step?.type || node.type) as string;
    const nodeName = (step?.name || node.id) as string;
    const nodeId = node.id as string;
    const pos = (node.position as Record<string, number>) ||
      ((node.data as Record<string, unknown>)?.position as Record<string, number>) ||
      { x: 0, y: 0 };

    idToName.set(nodeId, nodeName);

    // Merge parameters from step.config and step.parameters
    const config = (step?.config || {}) as Record<string, unknown>;
    const params = (step?.parameters || config) as Record<string, unknown>;

    n8nNodes.push({
      id: nodeId,
      name: nodeName,
      type: nodeType,
      typeVersion: step?.typeVersion || 1,
      position: [pos.x || 0, pos.y || 0],
      parameters: params,
    });
  }

  // Build connections from edges
  const connections: Record<string, { main: Array<Array<{ node: string; type: string; index: number }>> }> = {};
  for (const edge of sourceEdges) {
    const sourceName = idToName.get(edge.source) || edge.source;
    const targetName = idToName.get(edge.target) || edge.target;
    if (!connections[sourceName]) {
      connections[sourceName] = { main: [[]] };
    }
    connections[sourceName].main[0].push({
      node: targetName,
      type: "main",
      index: 0,
    });
  }

  return {
    name: `Drift ${workflowId.slice(0, 8)}`,
    nodes: n8nNodes,
    connections,
    active: true,
    settings: { executionOrder: "v1" },
  } as unknown as import("./n8n-types").N8nWorkflowJSON;
}

// ── Validation ──────────────────────────────────────────────────

/**
 * Validate a converted n8n workflow without pushing it.
 * Checks structural integrity: nodes, connections, triggers, Report node.
 */
function validateConversion(
  workflowName: string,
  conversion: ReturnType<typeof convertDriftToN8n>,
): DryRunResult {
  const { workflow, warnings, unmappedTypes } = conversion;
  const errors: string[] = [];

  // Must have at least one node
  if (workflow.nodes.length === 0) {
    errors.push("Converted workflow has zero nodes");
  }

  // Must have a trigger node
  const triggerNode = workflow.nodes.find(
    (n) =>
      n.type.includes("Trigger") ||
      n.type.includes("trigger") ||
      n.type.includes("webhook"),
  );
  if (!triggerNode) {
    errors.push("No trigger node found in converted workflow");
  }

  // Must have Report to Drift node
  const reportNode = workflow.nodes.find((n) => n.name === "Report to Drift");
  if (!reportNode) {
    errors.push("Missing 'Report to Drift' callback node");
  }

  // No unmapped types allowed for migration
  if (unmappedTypes.length > 0) {
    errors.push(`Unmapped step types: ${unmappedTypes.join(", ")}`);
  }

  // Connections must reference real nodes
  const nodeNames = new Set(workflow.nodes.map((n) => n.name));
  for (const [sourceName, conn] of Object.entries(workflow.connections)) {
    if (!nodeNames.has(sourceName)) {
      errors.push(`Connection from unknown node: "${sourceName}"`);
    }
    for (const outputs of conn.main) {
      for (const target of outputs) {
        if (!nodeNames.has(target.node)) {
          errors.push(`Connection to unknown node: "${target.node}"`);
        }
      }
    }
  }

  // Count connections
  let connectionCount = 0;
  for (const conn of Object.values(workflow.connections)) {
    for (const outputs of conn.main) {
      connectionCount += outputs.length;
    }
  }

  const triggerType = triggerNode
    ? triggerNode.type.includes("scheduleTrigger")
      ? "cron"
      : triggerNode.type.includes("webhook")
        ? "webhook"
        : "manual"
    : "unknown";

  return {
    success: errors.length === 0,
    nodeCount: workflow.nodes.length,
    connectionCount,
    triggerType,
    validationErrors: errors,
    n8nAccepted: false, // set after push
  };
}

// ── Single Workflow Migration ───────────────────────────────────

interface DriftWorkflowRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger: { type: string };
  graph: WorkflowGraph;
  n8n_workflow_id: string | null;
}

/**
 * Migrate a single workflow from legacy to n8n.
 * Returns a MigrationResult describing what happened.
 */
async function migrateSingle(
  row: DriftWorkflowRow,
  dryRunOnly: boolean,
): Promise<MigrationResult> {
  const base = { workflowId: row.id, workflowName: row.name };

  // Already migrated
  if (row.n8n_workflow_id) {
    return { ...base, status: "skipped", n8nWorkflowId: row.n8n_workflow_id };
  }

  // Must have a graph to convert
  const graph = row.graph as unknown as Record<string, unknown>;
  if (!graph || !graph.nodes || (Array.isArray(graph.nodes) && graph.nodes.length === 0)) {
    return { ...base, status: "skipped", error: "No graph data" };
  }

  // Detect format. Three cases:
  //   1. Pure n8n-native: has `connections`, no `edges`.
  //   2. Drift-wrapped n8n: has `edges` but node types contain dots
  //      (e.g. "n8n-nodes-base.webhook"). Cloned templates land here.
  //   3. Pure Drift: has `edges` and node types are Drift slugs
  //      (e.g. "trigger_webhook", "ai_prompt"). Needs full conversion.
  const nodes = graph.nodes as Array<Record<string, unknown>>;
  const hasConnections = !!graph.connections;
  const hasEdges = Array.isArray(graph.edges);
  const hasN8nNodeTypes = nodes.some(
    (n) => typeof n.type === "string" && n.type.includes("."),
  );
  const isN8nNative = hasConnections || (!hasEdges && Array.isArray(nodes));
  const isDriftWrappedN8n = hasEdges && hasN8nNodeTypes;

  let n8nWorkflow: import("./n8n-types").N8nWorkflowJSON;
  let warnings: string[] = [];

  if (isN8nNative) {
    // Pure n8n format -- use as-is
    n8nWorkflow = graph as unknown as import("./n8n-types").N8nWorkflowJSON;
    n8nBridge.patchGraphTrigger(n8nWorkflow.nodes, row.id);
    n8nBridge.patchGraphCredentials(n8nWorkflow.nodes);
  } else if (isDriftWrappedN8n) {
    // Drift graph structure (edges) but n8n node types. Restructure
    // by extracting the n8n step data and building connections from edges.
    n8nWorkflow = restructureDriftWrappedN8n(graph, row.id);
    n8nBridge.patchGraphTrigger(n8nWorkflow.nodes, row.id);
    n8nBridge.patchGraphCredentials(n8nWorkflow.nodes);
  } else {
    // Pure Drift format -- convert to n8n
    let conversion: ReturnType<typeof convertDriftToN8n>;
    try {
      conversion = convertDriftToN8n(row.graph, row.name);
    } catch (err) {
      return {
        ...base,
        status: "failed",
        error: `Conversion error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Validate the conversion
    const validationResult = validateConversion(row.name, conversion);
    if (!validationResult.success) {
      return {
        ...base,
        status: "dry_run_failed",
        dryRunResult: validationResult,
        warnings: conversion.warnings,
        error: validationResult.validationErrors.join("; "),
      };
    }

    n8nWorkflow = conversion.workflow;
    warnings = conversion.warnings;
    n8nBridge.patchGraphTrigger(n8nWorkflow.nodes, row.id);
    n8nBridge.patchGraphCredentials(n8nWorkflow.nodes);
  }

  // Build a dry-run result for reporting
  const triggerNode = n8nWorkflow.nodes.find(
    (n) => n.type.includes("Trigger") || n.type.includes("trigger") || n.type.includes("webhook"),
  );
  let connectionCount = 0;
  if (n8nWorkflow.connections) {
    for (const conn of Object.values(n8nWorkflow.connections)) {
      for (const outputs of (conn as { main: Array<Array<unknown>> }).main || []) {
        connectionCount += outputs.length;
      }
    }
  }
  const dryRun: DryRunResult = {
    success: true,
    nodeCount: n8nWorkflow.nodes.length,
    connectionCount,
    triggerType: triggerNode
      ? triggerNode.type.includes("scheduleTrigger")
        ? "cron"
        : triggerNode.type.includes("webhook")
          ? "webhook"
          : "manual"
      : "manual",
    validationErrors: [],
    n8nAccepted: false,
  };

  if (dryRunOnly) {
    return {
      ...base,
      status: "migrated", // would migrate
      dryRunResult: { ...dryRun, n8nAccepted: false },
      warnings,
    };
  }

  // Push to n8n
  let n8nWorkflowId: string;
  try {
    n8nWorkflowId = await n8nBridge.createWorkspaceWorkflow(
      row.workspace_id,
      {
        ...n8nWorkflow,
        // Preserve enabled state from the Drift workflow
        active: row.enabled,
      },
    );
    dryRun.n8nAccepted = true;
  } catch (err) {
    return {
      ...base,
      status: "failed",
      dryRunResult: dryRun,
      error: `n8n push failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Update Drift DB with n8n reference
  const triggerType = dryRun.triggerType === "unknown" ? "manual" : dryRun.triggerType;
  const { error: updateErr } = await supabaseAdmin
    .from("dante_workflows")
    .update({
      n8n_workflow_id: n8nWorkflowId,
      graph: n8nWorkflow,
      trigger: { type: triggerType },
      steps: n8nWorkflow.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        name: n.name,
        parameters: n.parameters,
      })),
    })
    .eq("id", row.id);

  if (updateErr) {
    migLog.error("DB update failed after n8n push", {
      workflowId: row.id,
      n8nWorkflowId,
      err: updateErr.message,
    });
    // Don't fail -- the n8n workflow exists, we can retry the DB update
  }

  return {
    ...base,
    status: "migrated",
    n8nWorkflowId,
    dryRunResult: dryRun,
    warnings,
  };
}

// ── Workspace Migration ─────────────────────────────────────────

/**
 * Migrate all legacy workflows in a workspace to n8n.
 *
 * @param workspaceId - Target workspace
 * @param dryRunOnly  - If true, validate but don't push to n8n
 * @returns Full migration report
 */
export async function migrateWorkspace(
  workspaceId: string,
  dryRunOnly = false,
): Promise<MigrationReport> {
  const startedAt = new Date().toISOString();

  migLog.info("starting workspace migration", { workspaceId, dryRunOnly });

  // Fetch all workflows for the workspace
  const { data: rows, error: fetchErr } = await supabaseAdmin
    .from("dante_workflows")
    .select("id, workspace_id, name, description, enabled, trigger, graph, n8n_workflow_id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (fetchErr) {
    migLog.error("failed to fetch workflows", { workspaceId, err: fetchErr.message });
    return {
      workspaceId,
      startedAt,
      completedAt: new Date().toISOString(),
      total: 0,
      migrated: 0,
      skipped: 0,
      failed: 0,
      dry_run_failed: 0,
      results: [],
    };
  }

  const workflows = (rows || []) as DriftWorkflowRow[];
  const results: MigrationResult[] = [];

  for (const wf of workflows) {
    try {
      const result = await migrateSingle(wf, dryRunOnly);
      results.push(result);
      migLog.info("workflow migration result", {
        workflowId: wf.id,
        name: wf.name,
        status: result.status,
        n8nWorkflowId: result.n8nWorkflowId,
      });
    } catch (err) {
      const result: MigrationResult = {
        workflowId: wf.id,
        workflowName: wf.name,
        status: "failed",
        error: `Unexpected: ${err instanceof Error ? err.message : String(err)}`,
      };
      results.push(result);
      migLog.error("unexpected migration error", {
        workflowId: wf.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const report: MigrationReport = {
    workspaceId,
    startedAt,
    completedAt: new Date().toISOString(),
    total: results.length,
    migrated: results.filter((r) => r.status === "migrated").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    dry_run_failed: results.filter((r) => r.status === "dry_run_failed").length,
    results,
  };

  migLog.info("workspace migration complete", {
    workspaceId,
    total: report.total,
    migrated: report.migrated,
    skipped: report.skipped,
    failed: report.failed,
    dry_run_failed: report.dry_run_failed,
  });

  return report;
}

// ── Bulk Migration (all workspaces) ─────────────────────────────

/**
 * Migrate all workspaces that have un-migrated workflows.
 * Used for the full fleet migration in Phase 2.
 */
export async function migrateAllWorkspaces(
  dryRunOnly = false,
): Promise<{
  reports: MigrationReport[];
  summary: {
    workspaces: number;
    totalWorkflows: number;
    migrated: number;
    skipped: number;
    failed: number;
  };
}> {
  // Find workspaces with at least one un-migrated workflow
  const { data: rows, error: fetchErr } = await supabaseAdmin
    .from("dante_workflows")
    .select("workspace_id")
    .is("n8n_workflow_id", null)
    .order("workspace_id");

  if (fetchErr || !rows) {
    migLog.error("failed to find workspaces for migration", {
      err: fetchErr?.message,
    });
    return {
      reports: [],
      summary: { workspaces: 0, totalWorkflows: 0, migrated: 0, skipped: 0, failed: 0 },
    };
  }

  // Deduplicate workspace IDs
  const workspaceIds = [...new Set(rows.map((r) => r.workspace_id as string))];

  migLog.info("starting bulk migration", {
    workspaceCount: workspaceIds.length,
    dryRunOnly,
  });

  const reports: MigrationReport[] = [];
  for (const wsId of workspaceIds) {
    const report = await migrateWorkspace(wsId, dryRunOnly);
    reports.push(report);
  }

  const summary = {
    workspaces: reports.length,
    totalWorkflows: reports.reduce((s, r) => s + r.total, 0),
    migrated: reports.reduce((s, r) => s + r.migrated, 0),
    skipped: reports.reduce((s, r) => s + r.skipped, 0),
    failed: reports.reduce((s, r) => s + r.failed + r.dry_run_failed, 0),
  };

  migLog.info("bulk migration complete", summary);

  return { reports, summary };
}

// ── Migration Report Email ──────────────────────────────────────

/**
 * Send a migration report email to workspace owner(s).
 * Non-fatal -- logs and returns silently on failure.
 */
export async function sendMigrationReport(report: MigrationReport): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    migLog.warn("RESEND_API_KEY not set, skipping migration report email");
    return;
  }

  // Find workspace owner emails
  const { data: owners } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("workspace_id", report.workspaceId)
    .eq("role", "owner");

  if (!owners?.length) return;

  const emails: string[] = [];
  for (const o of owners) {
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(o.id);
    if (u?.user?.email) emails.push(u.user.email);
  }

  if (emails.length === 0) return;

  const from = process.env.RESEND_FROM_EMAIL || "Drift <noreply@driftai.studio>";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://driftai.studio";

  const migratedList = report.results
    .filter((r) => r.status === "migrated")
    .map((r) => `  - ${r.workflowName} (${r.dryRunResult?.nodeCount ?? "?"} nodes)`)
    .join("\n");

  const failedList = report.results
    .filter((r) => r.status === "failed" || r.status === "dry_run_failed")
    .map((r) => `  - ${r.workflowName}: ${r.error}`)
    .join("\n");

  const body = [
    `Workflow engine migration complete for your workspace.`,
    ``,
    `Summary:`,
    `  Migrated: ${report.migrated}`,
    `  Already on n8n: ${report.skipped}`,
    `  Failed: ${report.failed + report.dry_run_failed}`,
    ``,
    report.migrated > 0 ? `Migrated workflows:\n${migratedList}` : null,
    (report.failed + report.dry_run_failed) > 0 ? `\nFailed workflows:\n${failedList}` : null,
    ``,
    `Your workflows now run on the n8n engine with better reliability,`,
    `retry handling, and execution observability. No action needed.`,
    ``,
    `View your workflows: ${appUrl}/workflows`,
  ].filter(Boolean).join("\n");

  for (const email of emails) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: email,
          subject: `Drift: workflow engine migration complete (${report.migrated} migrated)`,
          text: body,
        }),
      });
    } catch (err) {
      migLog.warn("failed to send migration report email", {
        email,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

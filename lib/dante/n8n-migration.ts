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
  dryRunFailed: number;
  results: MigrationResult[];
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
  if (!row.graph || !row.graph.nodes || row.graph.nodes.length === 0) {
    return { ...base, status: "skipped", error: "No graph data" };
  }

  // Convert
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

  // Validate
  const dryRun = validateConversion(row.name, conversion);
  if (!dryRun.success) {
    return {
      ...base,
      status: "dry_run_failed",
      dryRunResult: dryRun,
      warnings: conversion.warnings,
      error: dryRun.validationErrors.join("; "),
    };
  }

  if (dryRunOnly) {
    return {
      ...base,
      status: "migrated", // would migrate
      dryRunResult: { ...dryRun, n8nAccepted: false },
      warnings: conversion.warnings,
    };
  }

  // Push to n8n
  let n8nWorkflowId: string;
  try {
    n8nWorkflowId = await n8nBridge.createWorkspaceWorkflow(
      row.workspace_id,
      {
        ...conversion.workflow,
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
      graph: conversion.workflow,
      trigger: { type: triggerType },
      steps: conversion.workflow.nodes.map((n) => ({
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
    warnings: conversion.warnings,
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
      dryRunFailed: 0,
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
    dryRunFailed: results.filter((r) => r.status === "dry_run_failed").length,
    results,
  };

  migLog.info("workspace migration complete", {
    workspaceId,
    total: report.total,
    migrated: report.migrated,
    skipped: report.skipped,
    failed: report.failed,
    dryRunFailed: report.dryRunFailed,
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
    failed: reports.reduce((s, r) => s + r.failed + r.dryRunFailed, 0),
  };

  migLog.info("bulk migration complete", summary);

  return { reports, summary };
}

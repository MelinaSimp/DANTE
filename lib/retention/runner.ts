// lib/retention/runner.ts
//
// Phase 3+ panel fix #3 — retention worker.
//
// Soft deletes (Phase 2 W2.3) write `deleted_at` instead of removing
// rows. Without a worker, soft-deleted rows accumulate forever — and
// the workspace_retention_policies table is decorative.
//
// This worker reads each workspace's policy and hard-deletes rows
// that have been soft-deleted longer than the configured retention
// window. It runs from a cron-driven endpoint
// (/api/admin/retention/run); a superadmin can also trigger a run
// manually.
//
// Safety properties:
//
//   - hard_delete_enabled=false fully short-circuits the workspace.
//     A workspace under examination flips this off and the worker
//     never touches their data, regardless of policy.
//
//   - All deletes happen inside per-workspace try/catch. One
//     workspace's broken policy never blocks the rest of the run.
//
//   - Each run records (started_at, finished_at, rows_deleted_*,
//     errors) into retention_worker_runs for audit + monitoring.
//
//   - Audit logs receive one row per hard-delete batch (not per
//     row — that would explode for large workspaces).
//
// What the worker does NOT do:
//   - Override per-workspace minimums for regulated industries. The
//     policy table is the source of truth; the per-vertical
//     defaults from lib/industry/vertical-spec.ts seed it but the
//     actual values are workspace-controlled.
//   - Recover rows. Once hard-deleted, they're gone. Use the
//     citation/audit trail for recovery if needed.

import { supabaseAdmin } from "@/lib/supabase/admin";

export type Triggered = "cron" | "manual" | "admin";

interface PolicyRow {
  workspace_id: string;
  contacts_retention_days: number;
  documents_retention_days: number;
  memories_retention_days: number;
  conversations_retention_days: number;
  hard_delete_enabled: boolean;
}

export interface RetentionRunResult {
  run_id: string;
  workspaces_touched: number;
  rows_deleted: {
    contacts: number;
    documents: number;
    memories: number;
    conversations: number;
  };
  errors: Array<{ workspace_id: string; table: string; error: string }>;
  started_at: string;
  finished_at: string;
}

/**
 * Top-level entry. Walks every workspace's retention policy and
 * hard-deletes eligible soft-deleted rows. Returns a summary the
 * caller can render or log.
 *
 * Pass `dryRun: true` to compute counts without deleting. Useful
 * for the admin "what would the worker do tonight?" view.
 */
export async function runRetention(opts: {
  dryRun?: boolean;
  triggeredBy?: Triggered;
}): Promise<RetentionRunResult> {
  const startedAt = new Date().toISOString();
  const result: RetentionRunResult = {
    run_id: "",
    workspaces_touched: 0,
    rows_deleted: { contacts: 0, documents: 0, memories: 0, conversations: 0 },
    errors: [],
    started_at: startedAt,
    finished_at: startedAt,
  };

  // Open a run record up front so a crash mid-loop still leaves
  // a trail. We patch finished_at + counts on the way out.
  let runId: string | null = null;
  if (!opts.dryRun) {
    const { data, error } = await supabaseAdmin
      .from("retention_worker_runs")
      .insert({
        started_at: startedAt,
        triggered_by: opts.triggeredBy ?? "cron",
      })
      .select("id")
      .single();
    if (error) throw new Error(`retention: open run failed: ${error.message}`);
    runId = (data as { id: string }).id;
    result.run_id = runId;
  }

  const { data: policies, error: policyErr } = await supabaseAdmin
    .from("workspace_retention_policies")
    .select(
      "workspace_id, contacts_retention_days, documents_retention_days, memories_retention_days, conversations_retention_days, hard_delete_enabled",
    );
  if (policyErr) throw new Error(`retention: policy load failed: ${policyErr.message}`);

  for (const p of (policies || []) as PolicyRow[]) {
    if (!p.hard_delete_enabled) continue;
    result.workspaces_touched += 1;

    await processWorkspace(p, result, opts.dryRun ?? false);
  }

  const finishedAt = new Date().toISOString();
  result.finished_at = finishedAt;

  if (runId) {
    await supabaseAdmin
      .from("retention_worker_runs")
      .update({
        finished_at: finishedAt,
        workspaces_touched: result.workspaces_touched,
        rows_deleted_contacts: result.rows_deleted.contacts,
        rows_deleted_documents: result.rows_deleted.documents,
        rows_deleted_memories: result.rows_deleted.memories,
        rows_deleted_conversations: result.rows_deleted.conversations,
        errors: result.errors.length > 0 ? result.errors : null,
      })
      .eq("id", runId);
  }

  return result;
}

// ── Per-workspace processing ─────────────────────────────────────

async function processWorkspace(
  p: PolicyRow,
  result: RetentionRunResult,
  dryRun: boolean,
): Promise<void> {
  const targets: Array<{
    table: string;
    days: number;
    bucket: keyof RetentionRunResult["rows_deleted"];
  }> = [
    { table: "contacts", days: p.contacts_retention_days, bucket: "contacts" },
    {
      table: "dante_archive_documents",
      days: p.documents_retention_days,
      bucket: "documents",
    },
    { table: "dante_memory", days: p.memories_retention_days, bucket: "memories" },
    {
      table: "conversations",
      days: p.conversations_retention_days,
      bucket: "conversations",
    },
  ];

  for (const t of targets) {
    try {
      const cutoff = new Date(Date.now() - t.days * 86400 * 1000).toISOString();
      // Pull eligible row ids first so we can record an audit-log
      // entry pointing to them. Limit per pass keeps individual
      // calls under Supabase's row caps; the run will pick up the
      // remainder on the next tick.
      const { data: eligible, error: selErr } = await supabaseAdmin
        .from(t.table)
        .select("id")
        .lt("deleted_at", cutoff)
        .not("deleted_at", "is", null)
        .eq("workspace_id", p.workspace_id)
        .limit(500);
      if (selErr) {
        // Table might not exist yet (conversations, in some
        // workspaces). Skip with a logged error rather than failing
        // the whole run.
        const code = (selErr as { code?: string }).code;
        if (code === "42P01") continue;
        throw selErr;
      }

      const ids = (eligible || []).map((r: { id: string }) => r.id);
      if (ids.length === 0) continue;

      if (!dryRun) {
        const { error: delErr } = await supabaseAdmin
          .from(t.table)
          .delete()
          .in("id", ids)
          .eq("workspace_id", p.workspace_id);
        if (delErr) throw delErr;

        // Audit batch — one row per (workspace, table, run)
        // recording how many rows were hard-deleted. Per-row audit
        // would be excessive for retention sweeps.
        await supabaseAdmin.from("audit_logs").insert({
          workspace_id: p.workspace_id,
          user_id: null,
          action: "retention.hard_delete",
          resource_type: t.table,
          resource_id: null,
          metadata: {
            count: ids.length,
            cutoff,
            retention_days: t.days,
          },
          timestamp: new Date().toISOString(),
        });
      }

      result.rows_deleted[t.bucket] += ids.length;
    } catch (err) {
      result.errors.push({
        workspace_id: p.workspace_id,
        table: t.table,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

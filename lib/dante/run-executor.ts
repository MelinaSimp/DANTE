// lib/dante/run-executor.ts
//
// Shared "run this row" helper. Three callers land here:
//   1. Interactive /run endpoint (queue mode) — writes the queued row,
//      then the eager tick picks it up.
//   2. The queue tick sweeper — claims queued rows and runs them.
//   3. The cron tick — inserts queued rows when a crontab matches.
//
// Keeping the run + persist + last_run_at bookkeeping in one place
// means status columns stay consistent no matter who fired.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { runWorkflow } from "./workflow-runner";
import { definitionFromRow } from "./workflow-types";
import { logAuditEvent } from "@/lib/audit/log";
import { log as rootLog } from "@/lib/logging";

const execLog = rootLog.child({ component: "run-executor" });

// ── Failure notifications ────────────────────────────────────
// Email + SMS the workspace owner when a workflow errors so cron
// workflows don't fail silently for days.

export async function notifyRunFailure(opts: {
  workflowId: string;
  workflowName: string;
  workspaceId: string;
  runId: string;
  error: string;
}): Promise<void> {
  try {
    const { data: owners } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, sms_phone, sms_verified_at")
      .eq("workspace_id", opts.workspaceId)
      .eq("role", "owner");

    if (!owners?.length) return;

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL || "Drift <ops@driftai.studio>";
    const errorSnippet = opts.error.length > 300
      ? opts.error.slice(0, 297) + "..."
      : opts.error;

    for (const owner of owners) {
      // Email (via auth.users since email isn't on profiles)
      if (apiKey) {
        try {
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(owner.id);
          const email = authUser.user?.email;
          if (email) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from,
                to: email,
                subject: `Workflow failed: ${opts.workflowName}`,
                text: [
                  `Your workflow "${opts.workflowName}" just failed.`,
                  ``,
                  `Error: ${errorSnippet}`,
                  ``,
                  `View the run: https://driftai.studio/dante/workflows/${opts.workflowId}`,
                ].join("\n"),
              }),
            });
          }
        } catch (e) {
          execLog.warn("notification email failed", { error: e instanceof Error ? e.message : String(e) });
        }
      }

      // SMS if owner has a verified phone
      const p = owner as { sms_phone: string | null; sms_verified_at: string | null };
      if (p.sms_phone && p.sms_verified_at) {
        try {
          const { sendMessage } = await import("@/lib/sms/sender");
          await sendMessage(
            p.sms_phone,
            `Workflow failed: ${opts.workflowName}\n${errorSnippet}`,
          );
        } catch (e) {
          execLog.warn("notification SMS failed", { error: e instanceof Error ? e.message : String(e) });
        }
      }
    }
  } catch (e) {
    execLog.warn("notification failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

// ── Consecutive-failure escalation ──────────────────────────
// When a workflow fails 3+ times in a row, send a stronger alert
// to both the workspace owner and ops. This is deduped: we only
// alert once per (workflow, streak threshold) until the workflow
// succeeds again and resets the streak.

const STREAK_THRESHOLD = 3;
const OPS_EMAIL = "driftaillc@gmail.com";

export async function checkConsecutiveFailures(opts: {
  workflowId: string;
  workflowName: string;
  workspaceId: string;
}): Promise<void> {
  try {
    // Count consecutive errors from most recent
    const { data: recentRuns } = await supabaseAdmin
      .from("dante_workflow_runs")
      .select("status")
      .eq("workflow_id", opts.workflowId)
      .order("started_at", { ascending: false })
      .limit(STREAK_THRESHOLD + 1);

    if (!recentRuns) return;

    let streak = 0;
    for (const r of recentRuns) {
      if (r.status === "error") streak++;
      else break;
    }

    if (streak < STREAK_THRESHOLD) return;

    // Exact-threshold alert: only fire at 3, not at 4, 5, ...
    // For streak === 3 we alert. For higher we skip (already alerted).
    if (streak > STREAK_THRESHOLD) return;

    execLog.warn("consecutive failure threshold reached", {
      workflowId: opts.workflowId,
      workflowName: opts.workflowName,
      streak,
    });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;

    const from = process.env.RESEND_FROM_EMAIL || "Drift <ops@driftai.studio>";
    const subject = `[Alert] "${opts.workflowName}" has failed ${streak} times in a row`;
    const body = [
      `Workflow "${opts.workflowName}" has failed ${streak} consecutive times.`,
      ``,
      `This usually means something is structurally wrong — a missing API key,`,
      `a bad URL, or a downstream service that's offline.`,
      ``,
      `Review the run history: https://driftai.studio/dante/workflows/${opts.workflowId}`,
      ``,
      `The workflow will continue to run on its schedule. If the problem persists,`,
      `consider disabling it until the root cause is fixed.`,
    ].join("\n");

    // Send to ops
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: OPS_EMAIL, subject, text: body }),
      });
    } catch {
      // Best effort
    }

    // Also send to workspace owners
    const { data: owners } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("workspace_id", opts.workspaceId)
      .eq("role", "owner");

    if (owners?.length) {
      for (const owner of owners) {
        try {
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(owner.id);
          const email = authUser.user?.email;
          if (email && email !== OPS_EMAIL) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ from, to: email, subject, text: body }),
            });
          }
        } catch {
          // Best effort
        }
      }
    }
  } catch (e) {
    execLog.warn("consecutive failure check failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Atomic claim: flip a queued row to running. Returns the workflow row
 * we should execute, or null if another worker beat us to it.
 *
 * The `eq("status", "queued")` predicate on UPDATE makes this safe
 * under parallel workers — a second worker selecting the same row will
 * see 0 rows affected because the first worker already moved status.
 */
export async function claimQueuedRun(runId: string): Promise<{
  run: { id: string; workflow_id: string; workspace_id: string; input: unknown };
  workflow: Record<string, unknown>; // shape matches definitionFromRow input
} | null> {
  const { data: claimed, error } = await supabaseAdmin
    .from("dante_workflow_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "queued")
    .select("id, workflow_id, workspace_id, input")
    .maybeSingle();

  if (error || !claimed) return null;

  const { data: wf, error: wfErr } = await supabaseAdmin
    .from("dante_workflows")
    .select("*")
    .eq("id", claimed.workflow_id)
    .maybeSingle();

  if (wfErr || !wf) {
    // Workflow was deleted while the run was queued. Mark the run
    // errored so it doesn't sit in "running" forever.
    await supabaseAdmin.from("dante_workflow_runs").update({
      status: "error",
      error: "Workflow no longer exists",
      finished_at: new Date().toISOString(),
    }).eq("id", runId);
    return null;
  }

  return { run: claimed, workflow: wf };
}

/**
 * Execute a claimed run end-to-end and persist status, log, output,
 * and bump `last_run_*` on the parent workflow. Swallows executor
 * exceptions into the DB row so the caller (worker / cron) can
 * continue to the next job.
 */
export async function executeClaimedRun(
  run: { id: string; workflow_id: string; input: unknown },
  workflow: Record<string, unknown>,
): Promise<{ status: string }> {
  try {
    const definition = definitionFromRow(workflow as Parameters<typeof definitionFromRow>[0]);
    const input = (run.input && typeof run.input === "object") ? run.input as Record<string, unknown> : {};
    const result = await runWorkflow(definition, input, { runId: run.id });

    if (result.status === "waiting_approval") {
      await supabaseAdmin.from("dante_workflow_runs").update({
        status: "waiting_approval",
        log: result.log,
        output: result.output,
        paused_at_node: result.paused_at_node ?? null,
        approval_context: result.approval_context ?? null,
      }).eq("id", run.id);

      await supabaseAdmin.from("dante_workflows").update({
        last_run_at: new Date().toISOString(),
        last_run_status: "waiting_approval",
      }).eq("id", run.workflow_id);

      logAuditEvent({
        workspaceId: definition.workspace_id,
        actorKind: "agent",
        actorLabel: definition.name,
        action: "workflow.paused",
        entityType: "dante_workflow",
        entityId: run.workflow_id,
        metadata: { run_id: run.id, workflow_name: definition.name, reason: "waiting_approval" },
      });

      return { status: "waiting_approval" };
    }

    await supabaseAdmin.from("dante_workflow_runs").update({
      status: result.status,
      log: result.log,
      output: result.output,
      error: result.error ?? null,
      finished_at: new Date().toISOString(),
    }).eq("id", run.id);

    await supabaseAdmin.from("dante_workflows").update({
      last_run_at: new Date().toISOString(),
      last_run_status: result.status,
    }).eq("id", run.workflow_id);

    // Audit: log workflow completion so it surfaces in /audit.
    logAuditEvent({
      workspaceId: definition.workspace_id,
      actorKind: "agent",
      actorLabel: definition.name,
      action: result.status === "error" ? "workflow.failed" : "workflow.completed",
      entityType: "dante_workflow",
      entityId: run.workflow_id,
      metadata: {
        run_id: run.id,
        workflow_name: definition.name,
        status: result.status,
        ...(result.error ? { error: result.error.slice(0, 500) } : {}),
      },
    });

    // Only notify on actual errors, not cancellations
    if (result.status === "error") {
      notifyRunFailure({
        workflowId: run.workflow_id,
        workflowName: definition.name,
        workspaceId: definition.workspace_id,
        runId: run.id,
        error: result.error || "Unknown error",
      }).catch(() => {});
      checkConsecutiveFailures({
        workflowId: run.workflow_id,
        workflowName: definition.name,
        workspaceId: definition.workspace_id,
      }).catch(() => {});
    }

    return { status: result.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Run failed";
    await supabaseAdmin.from("dante_workflow_runs").update({
      status: "error",
      error: msg,
      finished_at: new Date().toISOString(),
    }).eq("id", run.id);
    await supabaseAdmin.from("dante_workflows").update({
      last_run_at: new Date().toISOString(),
      last_run_status: "error",
    }).eq("id", run.workflow_id);

    const wfName = (() => {
      try { return definitionFromRow(workflow as Parameters<typeof definitionFromRow>[0]).name; }
      catch { return run.workflow_id; }
    })();
    const wsId = (workflow as { workspace_id?: string }).workspace_id;
    if (wsId) {
      logAuditEvent({
        workspaceId: wsId,
        actorKind: "agent",
        actorLabel: wfName,
        action: "workflow.failed",
        entityType: "dante_workflow",
        entityId: run.workflow_id,
        metadata: { run_id: run.id, workflow_name: wfName, error: msg.slice(0, 500) },
      });
      notifyRunFailure({
        workflowId: run.workflow_id,
        workflowName: wfName,
        workspaceId: wsId,
        runId: run.id,
        error: msg,
      }).catch(() => {});
      checkConsecutiveFailures({
        workflowId: run.workflow_id,
        workflowName: wfName,
        workspaceId: wsId,
      }).catch(() => {});
    }

    return { status: "error" };
  }
}

/**
 * Insert a queued row. Used by the interactive /run endpoint when
 * mode=queue, and by the cron sweeper when a crontab matches.
 */
export async function enqueueRun(input: {
  workflow_id: string;
  workspace_id: string;
  triggered_by?: string | null;
  payload: Record<string, unknown>;
}): Promise<{ run_id: string } | { error: string }> {
  // ── Execution lock: prevent concurrent runs of the same workflow ──
  // If this workflow already has a queued or running run, reject the
  // new enqueue. This prevents cron double-fires and manual spam.
  const { data: active } = await supabaseAdmin
    .from("dante_workflow_runs")
    .select("id, status")
    .eq("workflow_id", input.workflow_id)
    .in("status", ["queued", "running"])
    .limit(1);

  if (active && active.length > 0) {
    return {
      error: `Workflow already has an active run (${active[0].status}). Wait for it to complete before starting another.`,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("dante_workflow_runs")
    .insert({
      workflow_id: input.workflow_id,
      workspace_id: input.workspace_id,
      triggered_by: input.triggered_by ?? null,
      status: "queued",
      input: input.payload,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message || "Failed to enqueue" };
  return { run_id: data.id };
}

/**
 * Fire a best-effort HTTP kick to the queue worker so a queued row
 * doesn't sit waiting for the next cron minute. We don't await the
 * response — on Vercel the lambda returns as soon as the request is
 * in flight and the worker picks up concurrently. If the kick is
 * dropped, the next cron tick is the backstop.
 */
export function kickQueueWorker(origin: string): void {
  const secret = process.env.CRON_SECRET;
  // No-op if we can't authenticate — the cron backstop still runs.
  if (!secret) return;
  const url = `${origin}/api/dante/queue/tick`;
  // Intentionally unawaited — Vercel will hold the function open
  // briefly via the runtime's pending-work tracking. `keepalive` is
  // a signal to the platform that this is a fire-and-forget.
  fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    keepalive: true,
  }).catch(() => {});
}

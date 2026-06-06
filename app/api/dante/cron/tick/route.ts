// app/api/dante/cron/tick/route.ts
//
// Scheduler tick — Vercel Cron (or any external caller) hits this
// once a minute. We sweep every enabled workflow whose graph holds
// a `trigger_cron` node, evaluate its crontab against the current
// UTC minute, and fire the run if it matches.
//
// Guardrails:
//   • Requires `Authorization: Bearer <CRON_SECRET>` (header only —
//     the `?key=` query-param fallback was removed because query
//     secrets leak via access logs / referrer headers). Set
//     CRON_SECRET in the environment and reference it from the
//     Vercel Cron / cron-job.org config so nobody can stampede.
//   • Per-workflow de-dupe: if `last_run_at` is within the last 50s we
//     skip, so a double-hit inside the same minute can't fire twice.
//   • Each workflow runs sequentially here — the Pro plan gives 300s
//     route budget. Large batches still enqueue via the queue worker.
//
// Add to vercel.json:
//   { "crons": [{ "path": "/api/dante/cron/tick", "schedule": "* * * * *" }] }

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { definitionFromRow, type WorkflowGraph, type GraphNode } from "@/lib/dante/workflow-types";
import { enqueueRun, claimQueuedRun, executeClaimedRun, kickQueueWorker } from "@/lib/dante/run-executor";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ── Cron field matcher ────────────────────────────────────────
// Handles: *, */n, a, a-b, a-b/n, and comma lists of any of the above.
// Not supported: named weekdays/months (MON, JAN), @reboot etc. Keep
// the grammar small until we actually need more.

function matchField(field: string, value: number): boolean {
  for (const part of field.split(",")) {
    if (part === "*") return true;
    const step = part.match(/^\*\/(\d+)$/);
    if (step) {
      const n = Number(step[1]);
      if (n > 0 && value % n === 0) return true;
      continue;
    }
    const range = part.match(/^(\d+)-(\d+)(?:\/(\d+))?$/);
    if (range) {
      const lo = Number(range[1]);
      const hi = Number(range[2]);
      const st = Number(range[3] || 1);
      if (value >= lo && value <= hi && (value - lo) % st === 0) return true;
      continue;
    }
    if (Number(part) === value) return true;
  }
  return false;
}

function cronMatches(expr: string, d: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [m, h, dom, mon, dow] = parts;
  return (
    matchField(m,   d.getUTCMinutes()) &&
    matchField(h,   d.getUTCHours()) &&
    matchField(dom, d.getUTCDate()) &&
    matchField(mon, d.getUTCMonth() + 1) &&
    matchField(dow, d.getUTCDay())
  );
}

function findCronTrigger(graph: WorkflowGraph): GraphNode | null {
  return graph.nodes.find((n) => n.type === "trigger_cron") ?? null;
}

function findAtTrigger(graph: WorkflowGraph): GraphNode | null {
  return graph.nodes.find((n) => n.type === "trigger_at") ?? null;
}

function findLeaseExpiryTrigger(graph: WorkflowGraph): GraphNode | null {
  return graph.nodes.find((n) => n.type === "trigger_lease_expiry") ?? null;
}

// ── Handler ───────────────────────────────────────────────────

async function handle(request: Request) {
  // Header-only cron auth — query-param fallback removed because
  // `?key=…` secrets land in access logs and referrer headers.
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const secret = process.env.CRON_SECRET;

  if (secret && bearer !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - 50_000).toISOString();

  // Pull every enabled workflow in the system that has a cron trigger.
  // Skip n8n-migrated workflows — n8n handles its own cron scheduling
  // via the scheduleTrigger node, so firing them here would duplicate.
  const { data: workflows, error } = await supabaseAdmin
    .from("dante_workflows")
    .select("*")
    .eq("enabled", true)
    .is("n8n_workflow_id", null)
    .or("trigger->>type.eq.cron,next_fire_at.not.is.null");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const fired: Array<{ id: string; status: string }> = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const wf of workflows || []) {
    const def = definitionFromRow(wf);
    const trigger = findCronTrigger(def.graph);
    if (!trigger) { skipped.push({ id: wf.id, reason: "no_cron_trigger" }); continue; }

    const cfg = trigger.data.step.config as { cron?: string };
    const cron = cfg?.cron;
    if (!cron || !cronMatches(cron, now)) {
      skipped.push({ id: wf.id, reason: "cron_no_match" });
      continue;
    }

    // De-dupe within the same minute.
    if (wf.last_run_at && wf.last_run_at > cutoff) {
      skipped.push({ id: wf.id, reason: "recent_run" });
      continue;
    }

    // Enqueue only — the queue worker picks it up on the next kick.
    // This keeps the cron tick itself well under the 60s budget even
    // with many scheduled workflows and long individual runs.
    const enq = await enqueueRun({
      workflow_id: wf.id,
      workspace_id: wf.workspace_id,
      triggered_by: null,
      payload: { triggered_by: "cron", cron, fired_at: now.toISOString() },
    });
    if ("error" in enq) {
      fired.push({ id: wf.id, status: "enqueue_failed" });
    } else {
      fired.push({ id: wf.id, status: "queued" });
      // Bump last_run_at so the in-minute de-dupe above catches a
      // double-tick; the real status arrives when the worker finishes.
      await supabaseAdmin.from("dante_workflows").update({
        last_run_at: new Date().toISOString(),
      }).eq("id", wf.id);
    }
  }

  // ── Second pass: trigger_at one-shots ─────────────────────────
  // Scheduling primitive for "remind me at X" — workflows with a
  // trigger_at node carry next_fire_at on the row. When that elapses
  // we fire once, then NULL next_fire_at and stamp fired_at so the
  // same run never repeats. Indexed on (next_fire_at) WHERE
  // next_fire_at IS NOT NULL — see the trigger_at migration.
  const nowIso = now.toISOString();
  const { data: dueAt, error: atErr } = await supabaseAdmin
    .from("dante_workflows")
    .select("*")
    .eq("enabled", true)
    .is("n8n_workflow_id", null)
    .not("next_fire_at", "is", null)
    .lte("next_fire_at", nowIso);

  if (atErr) {
    // Don't fail the whole tick on this — cron pass already ran.
    console.warn("[cron tick] trigger_at sweep failed:", atErr.message);
  } else {
    for (const wf of dueAt || []) {
      const def = definitionFromRow(wf);
      const trig = findAtTrigger(def.graph);
      if (!trig) {
        // next_fire_at set but no trigger_at node — defensive disarm
        // so the row doesn't keep showing up in the sweep.
        await supabaseAdmin.from("dante_workflows").update({
          next_fire_at: null,
        }).eq("id", wf.id);
        skipped.push({ id: wf.id, reason: "trigger_at_missing_node" });
        continue;
      }
      const enq = await enqueueRun({
        workflow_id: wf.id,
        workspace_id: wf.workspace_id,
        triggered_by: null,
        payload: {
          triggered_by: "trigger_at",
          scheduled_for: wf.next_fire_at,
          fired_at: nowIso,
        },
      });
      if ("error" in enq) {
        fired.push({ id: wf.id, status: "enqueue_failed" });
        // Leave next_fire_at set so the next tick retries.
        continue;
      }
      fired.push({ id: wf.id, status: "queued" });
      // Disarm immediately on successful enqueue. We accept a tiny
      // window where the queue could fail post-enqueue and the
      // workflow won't retry — same risk as cron, the alternative
      // (clear after run completes) re-fires on every tick until
      // the worker drains, which is worse.
      //
      // Also disable the workflow — trigger_at is a one-shot. Leaving
      // it enabled just clutters the cron tick sweep and the
      // workflows list with spent reminders.
      await supabaseAdmin.from("dante_workflows").update({
        next_fire_at: null,
        fired_at: nowIso,
        last_run_at: nowIso,
        enabled: false,
      }).eq("id", wf.id);
    }
  }

  // ── Third pass: trigger_lease_expiry ──────────────────────────
  // Skip n8n-migrated — they use the DriftLeaseLookup node natively.
  {
    const { data: allWfs } = await supabaseAdmin
      .from("dante_workflows")
      .select("*")
      .eq("enabled", true)
      .is("n8n_workflow_id", null);

    for (const wf of allWfs || []) {
      const def = definitionFromRow(wf);
      const trig = findLeaseExpiryTrigger(def.graph);
      if (!trig) continue;

      if (wf.last_run_at && wf.last_run_at > new Date(now.getTime() - 86_400_000).toISOString()) {
        skipped.push({ id: wf.id, reason: "lease_expiry_recent" });
        continue;
      }

      const daysBefore = (trig.data.step.config as { days_before?: number }).days_before ?? 90;
      const horizon = new Date(now.getTime() + daysBefore * 86_400_000).toISOString().slice(0, 10);

      const { data: leases } = await supabaseAdmin
        .from("lease_abstracts")
        .select("id, property_id, expiration_date, tenant_name")
        .eq("workspace_id", wf.workspace_id)
        .gte("expiration_date", now.toISOString().slice(0, 10))
        .lte("expiration_date", horizon);

      if (!leases?.length) {
        skipped.push({ id: wf.id, reason: "no_expiring_leases" });
        continue;
      }

      const enq = await enqueueRun({
        workflow_id: wf.id,
        workspace_id: wf.workspace_id,
        triggered_by: null,
        payload: {
          triggered_by: "lease_expiry",
          properties: leases,
          days_before: daysBefore,
          fired_at: nowIso,
        },
      });

      if ("error" in enq) {
        fired.push({ id: wf.id, status: "enqueue_failed" });
      } else {
        fired.push({ id: wf.id, status: "queued" });
        await supabaseAdmin.from("dante_workflows").update({
          last_run_at: new Date().toISOString(),
        }).eq("id", wf.id);
      }
    }
  }

  // ── Fourth pass: approval timeout ───────────────────────────
  {
    const { data: waitingRuns } = await supabaseAdmin
      .from("dante_workflow_runs")
      .select("id, approval_context, created_at")
      .eq("status", "waiting_approval");

    for (const run of waitingRuns || []) {
      const ctx = run.approval_context as Record<string, unknown> | null;
      const pausedNode = Object.values(ctx ?? {}).find(
        (v) => v && typeof v === "object" && (v as Record<string, unknown>).__approval_pause,
      ) as Record<string, unknown> | undefined;
      const timeoutHours = (pausedNode?.timeout_hours as number) || 72;
      const createdAt = new Date(run.created_at).getTime();
      if (now.getTime() - createdAt > timeoutHours * 3_600_000) {
        await supabaseAdmin
          .from("dante_workflow_runs")
          .update({
            status: "error",
            result: { status: "error", error: `Approval timed out after ${timeoutHours}h`, log: [] },
            finished_at: nowIso,
          })
          .eq("id", run.id);
      }
    }
  }

  // ── Fifth pass: pending nudges ──────────────────────────────
  // Nudges are written by the client when Dante needs input. After
  // 5 minutes (fire_at elapses), we send SMS/email server-side so
  // the nudge fires even if the user navigated away or closed the
  // app. The old client-side setTimeout was unreliable for this.
  {
    const { data: dueNudges } = await supabaseAdmin
      .from("dante_pending_nudges")
      .select("*")
      .eq("fired", false)
      .lte("fire_at", nowIso)
      .limit(10);

    for (const nudge of dueNudges || []) {
      // Check dedup — another path may have already sent this nudge
      if (nudge.chat_id) {
        const { data: already } = await supabaseAdmin
          .from("dante_audit_log")
          .select("id")
          .eq("event_type", "nudge_sent")
          .eq("metadata->>dedup_key", `nudge:${nudge.chat_id}`)
          .limit(1)
          .maybeSingle();
        if (already) {
          await supabaseAdmin.from("dante_pending_nudges")
            .update({ fired: true }).eq("id", nudge.id);
          continue;
        }
      }

      // Look up user for SMS/email delivery
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(nudge.user_id);
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("sms_phone, sms_verified_at")
        .eq("id", nudge.user_id)
        .maybeSingle();

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://driftai.studio";
      const link = nudge.chat_id
        ? `${appUrl}/dante/chat/${nudge.chat_id}`
        : `${appUrl}/dante`;
      const msg =
        `Dante needs your input to configure "${nudge.workflow_name}". ` +
        `Open Drift to continue: ${link}`;

      let channel: "sms" | "email" | "none" = "none";

      if (prof?.sms_phone && prof?.sms_verified_at) {
        try {
          const { sendMessage } = await import("@/lib/sms/sender");
          await sendMessage(prof.sms_phone, msg);
          channel = "sms";
        } catch {
          // fall through to email
        }
      }
      if (channel === "none" && u?.user?.email) {
        const apiKey = process.env.RESEND_API_KEY;
        const from = process.env.RESEND_FROM_EMAIL || "Drift <noreply@driftai.studio>";
        if (apiKey) {
          try {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from,
                to: u.user.email,
                subject: `Dante needs your input -- ${nudge.workflow_name}`,
                text: msg,
              }),
            });
            channel = "email";
          } catch { /* non-fatal */ }
        }
      }

      // Mark fired + audit log
      await supabaseAdmin.from("dante_pending_nudges")
        .update({ fired: true }).eq("id", nudge.id);
      if (nudge.chat_id && channel !== "none") {
        try {
          await supabaseAdmin.from("dante_audit_log").insert({
            workspace_id: nudge.workspace_id,
            user_id: nudge.user_id,
            event_type: "nudge_sent",
            metadata: {
              dedup_key: `nudge:${nudge.chat_id}`,
              channel,
              workflow_name: nudge.workflow_name,
            },
          });
        } catch { /* non-fatal */ }
      }
    }
  }

  // If the batch is small (1-3 runs), execute inline instead of
  // relying on kickQueueWorker — the fire-and-forget fetch can
  // silently fail on Vercel, leaving runs stuck for hours until
  // the next queue tick. Inline execution is safe within the 60s
  // budget for small batches (each run typically takes <2s).
  //
  // For larger batches, fall back to queue + kick so we don't
  // blow the 60s route budget.
  const queuedIds = fired
    .filter((f) => f.status === "queued")
    .map((f) => f.id);

  const INLINE_THRESHOLD = 3;
  if (queuedIds.length > 0 && queuedIds.length <= INLINE_THRESHOLD) {
    for (const wfId of queuedIds) {
      // Find the queued run we just created for this workflow
      const { data: runs } = await supabaseAdmin
        .from("dante_workflow_runs")
        .select("id")
        .eq("workflow_id", wfId)
        .eq("status", "queued")
        .order("started_at", { ascending: false, nullsFirst: true })
        .limit(1);
      const runId = runs?.[0]?.id;
      if (!runId) continue;
      const claim = await claimQueuedRun(runId);
      if (!claim) continue;
      const result = await executeClaimedRun(claim.run, claim.workflow);
      const entry = fired.find((f) => f.id === wfId);
      if (entry) entry.status = `inline_${result.status}`;
    }
  } else if (queuedIds.length > INLINE_THRESHOLD) {
    kickQueueWorker(new URL(request.url).origin);
  }

  return NextResponse.json({
    now: now.toISOString(),
    fired,
    skipped_count: skipped.length,
  });
}

export async function GET(request: Request)  { return handle(request); }
export async function POST(request: Request) { return handle(request); }

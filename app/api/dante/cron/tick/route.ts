// app/api/dante/cron/tick/route.ts
//
// Scheduler tick — Vercel Cron (or any external caller) hits this
// once a minute. We sweep every enabled workflow whose graph holds
// a `trigger_cron` node, evaluate its crontab against the current
// UTC minute, and fire the run if it matches.
//
// Guardrails:
//   • Requires `Authorization: Bearer <CRON_SECRET>` (or ?key=… query).
//     Set CRON_SECRET in the environment and reference it from the
//     Vercel Cron config so nobody else can stampede the tick.
//   • Per-workflow de-dupe: if `last_run_at` is within the last 50s we
//     skip, so a double-hit inside the same minute can't fire twice.
//   • Each workflow runs sequentially here — the Hobby plan caps route
//     execution at 60s so don't wire up anything slow. A phase-3 upgrade
//     is to enqueue rather than run inline.
//
// Add to vercel.json:
//   { "crons": [{ "path": "/api/dante/cron/tick", "schedule": "* * * * *" }] }

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { definitionFromRow, type WorkflowGraph, type GraphNode } from "@/lib/dante/workflow-types";
import { enqueueRun, kickQueueWorker } from "@/lib/dante/run-executor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

// ── Handler ───────────────────────────────────────────────────

async function handle(request: Request) {
  const url = new URL(request.url);
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const secret = process.env.CRON_SECRET;

  if (secret && bearer !== secret && url.searchParams.get("key") !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - 50_000).toISOString();

  // Pull every enabled workflow in the system. We scope by workspace
  // inside runWorkflow() via workflow.workspace_id.
  const { data: workflows, error } = await supabaseAdmin
    .from("dante_workflows")
    .select("*")
    .eq("enabled", true);
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

  // One eager kick at the end so the queue worker drains everything
  // we just enqueued without waiting for its own cron minute.
  if (fired.some((f) => f.status === "queued")) {
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

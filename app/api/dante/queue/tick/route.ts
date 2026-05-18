// app/api/dante/queue/tick/route.ts
//
// Background worker — drains the queued run table.
//
// Called two ways:
//   1. Vercel cron every minute (backstop) — sweeps anything that got
//      queued but never picked up.
//   2. Fire-and-forget kick right after /run enqueues a row, so the
//      user sees "running" almost immediately instead of waiting up
//      to 60s for the next cron tick.
//
// Both paths require `Authorization: Bearer <CRON_SECRET>` so a
// randomer can't cause an execution storm by hitting the URL.
//
// The worker picks up a small batch, claims each row atomically (an
// UPDATE ... WHERE status=queued RETURNING one row), and runs it.
// Parallel workers are safe — losers on the claim just move to the
// next row.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { claimQueuedRun, executeClaimedRun } from "@/lib/dante/run-executor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Don't try to drain more than this in one tick — keep us under the
// Hobby plan's 60s route budget even if each run takes 10s.
const BATCH_LIMIT = 4;

async function handle(request: Request) {
  // Header-only cron auth. The `?key=` fallback was removed because
  // query-param secrets land in access logs, referrer headers, and
  // proxy caches — anyone who can read a log line gets the secret.
  // Vercel Cron and cron-job.org both send `Authorization: Bearer …`.
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const secret = process.env.CRON_SECRET;

  if (secret && bearer !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Stuck-run recovery ───────────────────────────────────────
  // If a worker crashes after claiming a run (status: "running") but
  // before persisting the result, the row sits in "running" forever.
  // Mark any run that's been "running" for more than 10 minutes as
  // errored so it doesn't block the queue or confuse the UI.
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: staleRuns } = await supabaseAdmin
    .from("dante_workflow_runs")
    .update({
      status: "error",
      error: "Run timed out — worker may have crashed. Try running again.",
      finished_at: new Date().toISOString(),
    })
    .eq("status", "running")
    .lt("started_at", staleThreshold)
    .select("id");

  // Pull a batch of queued rows, oldest first. We ask for a small
  // overhead (limit * 2) so that if a parallel worker steals some we
  // can still fill our batch from the extras without another SELECT.
  const { data: candidates, error } = await supabaseAdmin
    .from("dante_workflow_runs")
    .select("id")
    .eq("status", "queued")
    .order("started_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_LIMIT * 2);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const processed: Array<{ run_id: string; status: string }> = [];
  const lost: string[] = [];

  for (const c of candidates || []) {
    if (processed.length >= BATCH_LIMIT) break;
    const claim = await claimQueuedRun(c.id);
    if (!claim) { lost.push(c.id); continue; }
    const result = await executeClaimedRun(claim.run, claim.workflow);
    processed.push({ run_id: c.id, status: result.status });
  }

  return NextResponse.json({
    claimed: processed.length,
    lost: lost.length,
    stale_recovered: staleRuns?.length ?? 0,
    processed,
  });
}

export async function GET(request: Request)  { return handle(request); }
export async function POST(request: Request) { return handle(request); }

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
  const url = new URL(request.url);
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const secret = process.env.CRON_SECRET;

  if (secret && bearer !== secret && url.searchParams.get("key") !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
    processed,
  });
}

export async function GET(request: Request)  { return handle(request); }
export async function POST(request: Request) { return handle(request); }

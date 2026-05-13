// app/api/cron/ingest-worker/route.ts
//
// Background worker — drains the vault ingest queue.
//
// Called two ways:
//   1. Vercel cron every minute (backstop) — sweeps anything that got
//      queued but never picked up.
//   2. Fire-and-forget kick right after enqueueIngest(), so a freshly
//      uploaded document starts ingesting immediately instead of waiting
//      up to 60s for the next cron tick.
//
// Auth: `Authorization: Bearer <CRON_SECRET>`. Open in dev when no
// secret is configured so local testing works without setup.
//
// Self-chaining: if pending rows remain after the batch finishes, the
// worker fires another kick so the queue drains continuously across
// multiple lambda invocations rather than waiting for the next cron.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  claimAndProcessBatch,
  kickIngestWorker,
} from "@/lib/vault/ingest-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const secret = process.env.CRON_SECRET;

  if (secret && bearer !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Release stale locks ─────────────────────────────────────────────
  const { data: staleReleased } = await supabaseAdmin.rpc(
    "release_stale_ingest_locks",
  );

  // ── Process batch under time budget ─────────────────────────────────
  const startTime = Date.now();
  const budgetMs = maxDuration * 1000 - 15_000; // 15s safety margin

  const { processed, failed, remaining } =
    await claimAndProcessBatch(budgetMs);

  // ── Self-chain if more work remains ─────────────────────────────────
  if (remaining > 0) {
    const origin =
      request.headers.get("x-forwarded-proto") &&
      request.headers.get("x-forwarded-host")
        ? `${request.headers.get("x-forwarded-proto")}://${request.headers.get("x-forwarded-host")}`
        : new URL(request.url).origin;
    kickIngestWorker(origin);
  }

  return NextResponse.json({
    ok: true,
    processed,
    failed,
    remaining,
    stale_released: staleReleased ?? 0,
    elapsed_ms: Date.now() - startTime,
  });
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}

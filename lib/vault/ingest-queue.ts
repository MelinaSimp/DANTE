// lib/vault/ingest-queue.ts
//
// Queue management for vault document ingestion. Three public helpers:
//
//   enqueueIngest()        — add a vault item to the ingest queue (deduped)
//   claimAndProcessBatch() — claim + process jobs under a time budget
//   kickIngestWorker()     — fire-and-forget nudge to the worker endpoint
//
// The queue table (`vault_ingest_queue`) holds pending/running/completed/
// failed/dead rows. Two Postgres RPCs handle the atomic parts:
//   - claim_ingest_jobs(batch_size, worker_id)  — atomic claim
//   - release_stale_ingest_locks()              — reclaim stuck rows

import { supabaseAdmin } from "@/lib/supabase/admin";
import { ingestVaultItem, type IngestResult } from "@/lib/vault/ingest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnqueueOpts {
  vaultItemId: string;
  workspaceId: string;
  requestedBy?: string;
  source?: "watched_folder" | "upload" | "reingest" | "backfill";
  priority?: number;
}

export interface EnqueueResult {
  id: string;
  deduplicated: boolean;
}

export interface BatchResult {
  processed: number;
  failed: number;
  remaining: number;
}

// ---------------------------------------------------------------------------
// enqueueIngest — insert into vault_ingest_queue with dedup
// ---------------------------------------------------------------------------

export async function enqueueIngest(
  opts: EnqueueOpts,
): Promise<EnqueueResult> {
  // Dedup: if a pending or running job already exists for this item, return it.
  const { data: existing } = await supabaseAdmin
    .from("vault_ingest_queue")
    .select("id")
    .eq("vault_item_id", opts.vaultItemId)
    .in("status", ["pending", "running"])
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { id: existing.id, deduplicated: true };
  }

  const { data, error } = await supabaseAdmin
    .from("vault_ingest_queue")
    .insert({
      vault_item_id: opts.vaultItemId,
      workspace_id: opts.workspaceId,
      requested_by: opts.requestedBy ?? null,
      source: opts.source ?? null,
      priority: opts.priority ?? 0,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`enqueueIngest: ${error?.message ?? "insert failed"}`);
  }

  return { id: data.id, deduplicated: false };
}

// ---------------------------------------------------------------------------
// claimAndProcessBatch — claim jobs via RPC + process under time budget
// ---------------------------------------------------------------------------

/** Estimate ~90 seconds per file (large docs hit 2-3min with HNSW contention). */
const MS_PER_FILE = 90_000;
/** Stop processing if less than this much budget remains. */
const MIN_BUDGET_MS = 30_000;
const MAX_BATCH = 3;

export async function claimAndProcessBatch(
  budgetMs: number,
): Promise<BatchResult> {
  const workerId = crypto.randomUUID();
  const batchSize = Math.min(MAX_BATCH, Math.max(1, Math.floor(budgetMs / MS_PER_FILE)));

  const { data: jobs, error: claimErr } = await supabaseAdmin.rpc(
    "claim_ingest_jobs",
    { p_batch_size: batchSize, p_worker_id: workerId },
  );

  if (claimErr) {
    throw new Error(`claim_ingest_jobs RPC: ${claimErr.message}`);
  }

  const claimed: Array<{ id: string; vault_item_id: string; attempts: number; max_attempts: number }> =
    jobs ?? [];

  let processed = 0;
  let failed = 0;
  const startTime = Date.now();

  for (const job of claimed) {
    // Check remaining time budget before starting next job.
    const elapsed = Date.now() - startTime;
    if (budgetMs - elapsed < MIN_BUDGET_MS && processed > 0) break;

    try {
      const result: IngestResult = await ingestVaultItem(job.vault_item_id, {
        force: true,
      });

      await supabaseAdmin
        .from("vault_ingest_queue")
        .update({
          status: "completed",
          chunk_count: result.chunkCount,
          completed_at: new Date().toISOString(),
          locked_by: null,
          locked_at: null,
        })
        .eq("id", job.id);

      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      const nextAttempt = (job.attempts ?? 0) + 1;
      const isDead = nextAttempt >= (job.max_attempts ?? 5);
      const backoffMs = Math.pow(2, nextAttempt) * 30_000;

      await supabaseAdmin
        .from("vault_ingest_queue")
        .update({
          status: isDead ? "dead" : "failed",
          last_error: msg,
          run_after: isDead
            ? null
            : new Date(Date.now() + backoffMs).toISOString(),
          locked_by: null,
          locked_at: null,
        })
        .eq("id", job.id);

      failed++;
    }
  }

  // Count remaining pending rows so the caller can decide whether to
  // chain another worker invocation.
  const { count } = await supabaseAdmin
    .from("vault_ingest_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return { processed, failed, remaining: count ?? 0 };
}

// ---------------------------------------------------------------------------
// kickIngestWorker — fire-and-forget nudge (mirrors kickQueueWorker pattern)
// ---------------------------------------------------------------------------

export function kickIngestWorker(origin: string): void {
  const secret = process.env.CRON_SECRET;
  // No-op if we can't authenticate — the cron backstop still runs.
  if (!secret) return;
  const url = `${origin}/api/cron/ingest-worker`;
  // Intentionally unawaited — Vercel will hold the function open
  // briefly via the runtime's pending-work tracking. `keepalive` is
  // a signal to the platform that this is a fire-and-forget.
  fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    keepalive: true,
  }).catch(() => {});
}

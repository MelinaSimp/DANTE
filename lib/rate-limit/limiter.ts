// lib/rate-limit/limiter.ts
//
// Phase 2 W2.5 — workspace-scoped rate limiter.
//
// Hot paths (memory.search, archive.search, /api/dante/ask, vault
// upload) need a per-workspace ceiling so a single tenant can't DoS
// the platform — and tier-scoped limits will eventually translate
// into the plan tiers shipped with the Stripe SKU surface.
//
// Backed by Supabase (a token-bucket row per (workspace, route))
// rather than Redis to keep infrastructure surface small. Drift is
// not yet a multi-region deployment; when it becomes one this file
// is the seam where Upstash Redis or Cloudflare Durable Objects
// land. The exported function shape stays stable across that swap.
//
// Algorithm: classic token bucket. Each (workspace_id, bucket) row
// holds {tokens, last_refill_at, capacity, refill_per_min}. A
// request reads + writes the row in a single round-trip (Supabase
// RPC could batch, but the simple two-call path is fine for now —
// hot paths are sub-second already).

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface RateLimitOptions {
  workspaceId: string;
  /** Logical bucket name. Use stable strings; one row per (ws, bucket). */
  bucket: string;
  /** Token cost of this request. Default 1 — large requests can charge more. */
  cost?: number;
  /** Bucket capacity. Defaults to 60 tokens. */
  capacity?: number;
  /** Tokens added per minute. Defaults to capacity (= 1 minute window). */
  refillPerMin?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Check + decrement. Returns `{allowed: false}` when the bucket
 * doesn't have enough tokens; the caller should respond 429 with
 * `Retry-After: <retryAfterMs/1000>`.
 *
 * Never throws on infra errors — failing open under DB stress is
 * the right call for a non-billing rate limiter. Logs on degraded
 * paths so observability still catches the issue.
 */
export async function rateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const cost = Math.max(1, Math.floor(opts.cost ?? 1));
  const capacity = Math.max(1, Math.floor(opts.capacity ?? 60));
  const refill = Math.max(1, Math.floor(opts.refillPerMin ?? capacity));
  const now = new Date();
  const nowIso = now.toISOString();

  try {
    // Read current bucket state (or sentinel for first-time row).
    const { data: row } = await supabaseAdmin
      .from("rate_limit_buckets")
      .select("tokens, last_refill_at, capacity, refill_per_min")
      .eq("workspace_id", opts.workspaceId)
      .eq("bucket", opts.bucket)
      .maybeSingle();

    let tokens: number;
    let lastRefillAt: Date;
    if (!row) {
      tokens = capacity;
      lastRefillAt = now;
    } else {
      const r = row as {
        tokens: number;
        last_refill_at: string;
        capacity: number;
        refill_per_min: number;
      };
      lastRefillAt = new Date(r.last_refill_at);
      const elapsedMs = now.getTime() - lastRefillAt.getTime();
      const refillTokens = Math.floor((elapsedMs / 60000) * r.refill_per_min);
      tokens = Math.min(r.capacity, r.tokens + refillTokens);
      // Use the row's persisted capacity/refill in case caller passes
      // mismatched values (caller config can drift; row is canonical).
    }

    if (tokens < cost) {
      const tokensShort = cost - tokens;
      const retryAfterMs = Math.ceil((tokensShort / refill) * 60000);
      return { allowed: false, remaining: tokens, retryAfterMs };
    }

    const newTokens = tokens - cost;

    // Upsert. Conflict on (workspace_id, bucket).
    const { error } = await supabaseAdmin.from("rate_limit_buckets").upsert(
      {
        workspace_id: opts.workspaceId,
        bucket: opts.bucket,
        tokens: newTokens,
        last_refill_at: nowIso,
        capacity,
        refill_per_min: refill,
        updated_at: nowIso,
      },
      { onConflict: "workspace_id,bucket" },
    );
    if (error) {
      console.warn("[rate-limit] upsert failed (fail open):", error.message);
      return { allowed: true, remaining: newTokens, retryAfterMs: 0 };
    }

    return { allowed: true, remaining: newTokens, retryAfterMs: 0 };
  } catch (err) {
    console.warn("[rate-limit] check failed (fail open):", err);
    return { allowed: true, remaining: capacity, retryAfterMs: 0 };
  }
}

/** Convenience: return a 429 Response when rate-limited, otherwise null. */
export function rateLimitResponse(r: RateLimitResult): Response | null {
  if (r.allowed) return null;
  return new Response(
    JSON.stringify({ error: "rate_limited", retry_after_ms: r.retryAfterMs }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil(r.retryAfterMs / 1000)),
      },
    },
  );
}

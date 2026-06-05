// lib/dante/workflow-cache.ts
//
// Cross-run step result cache for workflow and agent coordination.
//
// Problem: agents and workflows often repeat expensive computations
// (LLM calls, external API lookups, parcel queries) when the same
// question has been answered in a recent run. The cache lets them
// skip re-execution by checking if an identical step was recently
// completed.
//
// Cache key: SHA-256 hash of (workspaceId + stepType + config JSON).
// Cache value: the step's output, stored for up to `ttlMinutes`.
//
// This is NOT the idempotency table (which prevents duplicate
// side-effects within a single run). This is a performance cache
// across runs.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { log as rootLog } from "@/lib/logging";

const cacheLog = rootLog.child({ component: "workflow-cache" });

// In-memory LRU for hot-path reads (avoids DB round-trip for
// frequently-accessed cache entries within the same process).
const MEM_CACHE = new Map<string, { value: unknown; expiresAt: number }>();
const MEM_CACHE_MAX = 200;

function memGet(key: string): unknown | undefined {
  const entry = MEM_CACHE.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    MEM_CACHE.delete(key);
    return undefined;
  }
  return entry.value;
}

function memSet(key: string, value: unknown, ttlMs: number): void {
  if (MEM_CACHE.size >= MEM_CACHE_MAX) {
    // Evict oldest entry
    const firstKey = MEM_CACHE.keys().next().value;
    if (firstKey) MEM_CACHE.delete(firstKey);
  }
  MEM_CACHE.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ── Key generation ──────────────────────────────────────────────

async function hashKey(parts: string): Promise<string> {
  // Use Web Crypto API (available in Node 18+ and edge runtimes)
  const encoder = new TextEncoder();
  const data = encoder.encode(parts);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function makeCacheKey(
  workspaceId: string,
  stepType: string,
  config: Record<string, unknown>,
): Promise<string> {
  // Sort config keys for deterministic hashing
  const configStr = JSON.stringify(config, Object.keys(config).sort());
  return hashKey(`${workspaceId}:${stepType}:${configStr}`);
}

// ── Cache operations ────────────────────────────────────────────

export interface CacheEntry {
  key: string;
  workspace_id: string;
  step_type: string;
  output: unknown;
  created_at: string;
  expires_at: string;
}

/**
 * Check the cache for a previously computed step result.
 * Returns the cached output if found and not expired, null otherwise.
 */
export async function getCachedResult(
  workspaceId: string,
  stepType: string,
  config: Record<string, unknown>,
): Promise<unknown | null> {
  const key = await makeCacheKey(workspaceId, stepType, config);

  // Check in-memory first
  const memResult = memGet(key);
  if (memResult !== undefined) {
    cacheLog.debug("cache hit (memory)", { stepType, key: key.slice(0, 12) });
    return memResult;
  }

  // Check DB
  try {
    const { data } = await supabaseAdmin
      .from("dante_workflow_step_cache")
      .select("output, expires_at")
      .eq("cache_key", key)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (!data) return null;

    // Check expiry
    if (new Date(data.expires_at) < new Date()) {
      cacheLog.debug("cache expired", { stepType, key: key.slice(0, 12) });
      return null;
    }

    // Populate memory cache
    const ttlMs = new Date(data.expires_at).getTime() - Date.now();
    memSet(key, data.output, ttlMs);

    cacheLog.debug("cache hit (db)", { stepType, key: key.slice(0, 12) });
    return data.output;
  } catch (err) {
    cacheLog.warn("cache read failed", { error: String(err) });
    return null;
  }
}

/**
 * Store a step result in the cache.
 * Default TTL: 60 minutes for LLM calls, 30 minutes for external APIs.
 */
export async function setCachedResult(
  workspaceId: string,
  stepType: string,
  config: Record<string, unknown>,
  output: unknown,
  ttlMinutes = 60,
): Promise<void> {
  const key = await makeCacheKey(workspaceId, stepType, config);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  // In-memory
  memSet(key, output, ttlMinutes * 60 * 1000);

  // DB (upsert)
  try {
    await supabaseAdmin
      .from("dante_workflow_step_cache")
      .upsert(
        {
          cache_key: key,
          workspace_id: workspaceId,
          step_type: stepType,
          output,
          expires_at: expiresAt,
        },
        { onConflict: "cache_key" },
      );

    cacheLog.debug("cache set", {
      stepType,
      key: key.slice(0, 12),
      ttlMinutes,
    });
  } catch (err) {
    // Non-fatal — cache writes are best-effort
    cacheLog.warn("cache write failed", { error: String(err) });
  }
}

/**
 * Invalidate all cached results for a workspace.
 * Called when workspace data changes materially (e.g., bulk import).
 */
export async function invalidateWorkspaceCache(
  workspaceId: string,
): Promise<void> {
  // Clear in-memory (can't selectively clear by workspace, so clear all)
  MEM_CACHE.clear();

  try {
    await supabaseAdmin
      .from("dante_workflow_step_cache")
      .delete()
      .eq("workspace_id", workspaceId);

    cacheLog.info("cache invalidated", { workspaceId });
  } catch (err) {
    cacheLog.warn("cache invalidation failed", { error: String(err) });
  }
}

// ── TTL defaults by step type ───────────────────────────────────

const STEP_TTL_MINUTES: Record<string, number> = {
  openai: 60,           // LLM responses: 1 hour
  agent: 60,            // Agent results: 1 hour
  query_clients: 15,    // Contact queries: 15 min (data changes)
  query_properties: 15, // Property queries: 15 min
  http: 30,             // External API GET: 30 min
  code: 120,            // Pure code: 2 hours (deterministic)
  integration_query: 30,
};

export function getDefaultTTL(stepType: string): number {
  return STEP_TTL_MINUTES[stepType] ?? 60;
}

// ── Cacheable step types ────────────────────────────────────────
// Side-effect steps (send_email, send_sms, update_contact) are
// never cached — they must always execute.

const NON_CACHEABLE = new Set([
  "send_email",
  "send_sms",
  "update_contact",
  "approval",
  "trigger_manual",
  "trigger_cron",
  "trigger_webhook",
  "trigger_at",
  "trigger_lease_expiry",
]);

export function isCacheableStep(stepType: string): boolean {
  return !NON_CACHEABLE.has(stepType);
}

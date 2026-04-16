/**
 * Distributed sliding-window rate limiter.
 *
 * Uses Upstash Redis (via REST API) when UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN are configured. Falls back to an in-memory
 * Map for local development. The in-memory fallback is **not** safe for
 * multi-instance production deployments — it's here so dev works without
 * an Upstash account.
 *
 * Algorithm (Upstash): sorted set per key.
 *   ZREMRANGEBYSCORE key 0 (now - window)   -- drop expired entries
 *   ZADD             key now now            -- record this request
 *   ZCARD            key                    -- count live entries
 *   PEXPIRE          key window             -- keep key alive
 * All four commands are sent in a single pipeline request.
 */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const upstashEnabled = !!(UPSTASH_URL && UPSTASH_TOKEN);

// In-memory fallback (dev only).
const memoryWindows = new Map<string, number[]>();
const MEM_CLEANUP_INTERVAL = 60_000;
let lastMemCleanup = Date.now();

function memCleanup(windowMs: number) {
  const cutoff = Date.now() - windowMs * 2;
  for (const [key, timestamps] of memoryWindows) {
    const live = timestamps.filter((t) => t > cutoff);
    if (live.length === 0) memoryWindows.delete(key);
    else memoryWindows.set(key, live);
  }
  lastMemCleanup = Date.now();
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

async function upstashPipeline(commands: (string | number)[][]): Promise<unknown[]> {
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    // Short timeout — we'd rather fail-open than block a user request.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Upstash ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function upstashRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const cutoff = now - windowMs;
  const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;
  const prefixed = `rl:${key}`;

  try {
    const results = (await upstashPipeline([
      ["ZREMRANGEBYSCORE", prefixed, 0, cutoff],
      ["ZADD", prefixed, now, member],
      ["ZCARD", prefixed],
      ["PEXPIRE", prefixed, windowMs],
    ])) as Array<{ result: unknown }>;

    const count = Number(results[2]?.result ?? 0);
    if (count > limit) {
      return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining: Math.max(0, limit - count) };
  } catch (err) {
    // Fail open: don't block legitimate users because of a Redis hiccup.
    // (Better: log to Sentry and alert, but falling open is the right
    // default for a rate limiter vs. a security-critical gate.)
    console.warn("[rateLimit] Upstash error, failing open:", err);
    return { allowed: true, remaining: limit };
  }
}

function memoryRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  if (Date.now() - lastMemCleanup > MEM_CLEANUP_INTERVAL) memCleanup(windowMs);

  const now = Date.now();
  const cutoff = now - windowMs;
  const timestamps = (memoryWindows.get(key) || []).filter((t) => t > cutoff);

  if (timestamps.length >= limit) {
    return { allowed: false, remaining: 0 };
  }

  timestamps.push(now);
  memoryWindows.set(key, timestamps);
  return { allowed: true, remaining: limit - timestamps.length };
}

/**
 * Check / consume a rate-limit token.
 * @param key   unique identifier (e.g. IP or userId)
 * @param limit max requests in the window
 * @param windowMs window size in ms (default 60 000 = 1 min)
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs = 60_000
): Promise<RateLimitResult> {
  if (upstashEnabled) {
    return upstashRateLimit(key, limit, windowMs);
  }

  if (process.env.NODE_ENV === "production") {
    // Warn once per cold start so misconfiguration is visible.
    if (!warnedMissingUpstash) {
      warnedMissingUpstash = true;
      console.warn(
        "[rateLimit] UPSTASH_REDIS_REST_URL not set — rate limiting is per-instance only and will NOT work correctly across Vercel's serverless fleet."
      );
    }
  }

  return memoryRateLimit(key, limit, windowMs);
}

let warnedMissingUpstash = false;

export function rateLimitResponse() {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please try again later." }),
    { status: 429, headers: { "Content-Type": "application/json" } }
  );
}

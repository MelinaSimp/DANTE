/**
 * Simple in-memory sliding-window rate limiter.
 * Good enough for a single Vercel instance; for multi-instance,
 * swap the Map for Upstash Redis.
 */
const windows = new Map<string, number[]>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const cutoff = Date.now() - windowMs * 2;
  for (const [key, timestamps] of windows) {
    const live = timestamps.filter((t) => t > cutoff);
    if (live.length === 0) windows.delete(key);
    else windows.set(key, live);
  }
  lastCleanup = Date.now();
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * Check / consume a rate-limit token.
 * @param key   unique identifier (e.g. IP or userId)
 * @param limit max requests in the window
 * @param windowMs window size in ms (default 60 000 = 1 min)
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs = 60_000
): RateLimitResult {
  if (Date.now() - lastCleanup > CLEANUP_INTERVAL) cleanup(windowMs);

  const now = Date.now();
  const cutoff = now - windowMs;
  const timestamps = (windows.get(key) || []).filter((t) => t > cutoff);

  if (timestamps.length >= limit) {
    return { allowed: false, remaining: 0 };
  }

  timestamps.push(now);
  windows.set(key, timestamps);
  return { allowed: true, remaining: limit - timestamps.length };
}

export function rateLimitResponse() {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please try again later." }),
    { status: 429, headers: { "Content-Type": "application/json" } }
  );
}

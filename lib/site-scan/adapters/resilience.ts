// lib/site-scan/adapters/resilience.ts
//
// Retry logic + circuit breaker for county ArcGIS services.
// County-hosted GIS servers are flaky: 503s, timeouts, rate
// limits are common. Without resilience, a single bad response
// kills an entire void analysis.

// ── Typed errors ────────────────────────────────────────────

export class ArcGISError extends Error {
  constructor(
    public county: string,
    public state: string,
    public httpStatus: number | null,
    public detail: string,
  ) {
    super(`ArcGIS error for ${county}, ${state}: ${detail}`);
    this.name = "ArcGISError";
  }
}

export class CircuitOpenError extends Error {
  constructor(
    public county: string,
    public state: string,
  ) {
    super(
      `${county} County, ${state} GIS is temporarily unavailable (circuit breaker open).`,
    );
    this.name = "CircuitOpenError";
  }
}

// ── Retry with exponential backoff ──────────────────────────

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;

function jitter(ms: number): number {
  return ms + Math.random() * ms * 0.3;
}

export async function fetchWithRetry(
  url: string,
  opts?: { timeout?: number },
): Promise<Response> {
  const timeout = opts?.timeout ?? 15_000;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const delay = jitter(BASE_DELAY_MS * Math.pow(2, attempt - 1));
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeout),
      });

      if (res.ok || !RETRYABLE_STATUSES.has(res.status)) {
        return res;
      }

      // Retryable HTTP status — try again
      lastError = new Error(`HTTP ${res.status} ${res.statusText}`);
      console.warn(
        `[arcgis-retry] attempt ${attempt + 1}/${MAX_ATTEMPTS} failed: ${res.status}`,
      );
    } catch (err) {
      // Network error or timeout — retryable
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[arcgis-retry] attempt ${attempt + 1}/${MAX_ATTEMPTS} error: ${lastError.message}`,
      );
    }
  }

  throw lastError ?? new Error("fetchWithRetry: all attempts failed");
}

// ── Circuit breaker ─────────────────────────────────────────
//
// Per-county circuit breaker. In-memory (resets on deploy).
//
//   CLOSED → normal operation
//   OPEN   → skip all requests for this county (2 min cooldown)
//   HALF_OPEN → allow one probe request; success→CLOSED, fail→OPEN

type CBState = "closed" | "open" | "half_open";

const FAILURE_THRESHOLD = 3;
const OPEN_DURATION_MS = 2 * 60 * 1000; // 2 minutes
const FAILURE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

interface CircuitState {
  state: CBState;
  failures: number[];
  openedAt: number;
}

const circuits = new Map<string, CircuitState>();

function getState(key: string): CircuitState {
  let s = circuits.get(key);
  if (!s) {
    s = { state: "closed", failures: [], openedAt: 0 };
    circuits.set(key, s);
  }
  return s;
}

function countyKey(state: string, county: string): string {
  return `${state}:${county}`;
}

export function isCircuitOpen(state: string, county: string): boolean {
  const key = countyKey(state, county);
  const s = getState(key);

  if (s.state === "closed") return false;

  if (s.state === "open") {
    // Check if cooldown has elapsed → transition to half_open
    if (Date.now() - s.openedAt >= OPEN_DURATION_MS) {
      s.state = "half_open";
      return false; // allow probe
    }
    return true; // still open
  }

  // half_open — allow the probe
  return false;
}

export function recordSuccess(state: string, county: string): void {
  const key = countyKey(state, county);
  const s = getState(key);
  s.state = "closed";
  s.failures = [];
}

export function recordFailure(state: string, county: string): void {
  const key = countyKey(state, county);
  const s = getState(key);
  const now = Date.now();

  if (s.state === "half_open") {
    // Probe failed → re-open
    s.state = "open";
    s.openedAt = now;
    return;
  }

  // Prune old failures outside the window
  s.failures = s.failures.filter((t) => now - t < FAILURE_WINDOW_MS);
  s.failures.push(now);

  if (s.failures.length >= FAILURE_THRESHOLD) {
    s.state = "open";
    s.openedAt = now;
    console.warn(
      `[circuit-breaker] ${state}:${county} circuit OPEN after ${FAILURE_THRESHOLD} failures`,
    );
  }
}

/** Reset all circuit breakers (for testing). */
export function resetAllCircuits(): void {
  circuits.clear();
}

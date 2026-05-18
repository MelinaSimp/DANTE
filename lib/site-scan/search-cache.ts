// lib/site-scan/search-cache.ts
//
// In-memory LRU cache for ArcGIS parcel search results.
// Avoids re-hitting county servers on repeat queries (same
// void analysis re-run, user refining search criteria).
//
// TTL: 1 hour. Max entries: 200. Evicts oldest on overflow.
// Resets on deploy (Vercel cold start).

import type { ParcelSummary } from "./adapters/types";

const TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 200;

interface CacheEntry {
  results: ParcelSummary[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Build a deterministic cache key from the full ArcGIS query URL.
 * Strips the `f=json` param since it doesn't affect results.
 */
export function searchCacheKey(queryUrl: string): string {
  try {
    const u = new URL(queryUrl);
    u.searchParams.delete("f");
    // Sort params for determinism
    const sorted = new URLSearchParams([...u.searchParams.entries()].sort());
    return `${u.origin}${u.pathname}?${sorted.toString()}`;
  } catch {
    return queryUrl;
  }
}

export function getCachedSearch(key: string): ParcelSummary[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.results;
}

export function setCachedSearch(
  key: string,
  results: ParcelSummary[],
): void {
  // Evict oldest entries if at capacity
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest != null) cache.delete(oldest);
  }
  cache.set(key, { results, timestamp: Date.now() });
}

/** Clear all cached entries (for testing). */
export function clearSearchCache(): void {
  cache.clear();
}

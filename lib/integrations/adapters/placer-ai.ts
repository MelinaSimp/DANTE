// lib/integrations/adapters/placer-ai.ts
//
// Placer.ai API adapter for foot traffic analytics.
//
// Placer.ai provides location-level visit counts, visitor demographics,
// trade area geometry, and competitive benchmarks. Their API requires
// a Placer Pro or Enterprise subscription.
//
// Connect: validates the API key with a lightweight test request.
// Sync:    validates the key is still active. Placer.ai is primarily a
//          query-on-demand service (like Google Maps), so bulk sync is
//          limited to key validation and optional pre-caching.
//
// Exported query functions are consumed by Dante agent tools to enrich
// void analysis and site selection workflows.

import type {
  IntegrationAdapter,
  ConnectInput,
  ConnectResult,
  SyncResult,
  ConnectionRow,
} from "../adapter";
import { getProvider } from "../registry";
import { supabaseAdmin } from "@/lib/supabase/admin";

const PROVIDER_ID = "placer_ai";
const API_BASE = "https://api.placer.ai/v1";
const REQUEST_TIMEOUT_MS = 15_000;

// ── Types ────────────────────────────────────────────────────

export interface FootTrafficData {
  location: { lat: number; lng: number };
  daily_visits_avg: number;
  weekly_visits_avg: number;
  peak_hours: Array<{ hour: number; avg_visits: number }>;
  visitor_demographics?: {
    median_hhi?: number;
    age_distribution?: Record<string, number>;
    gender_split?: { male: number; female: number };
  };
  trade_area_radius_mi: number;
  fetched_at: string;
}

export interface TradeAreaData {
  location: { lat: number; lng: number };
  primary_radius_mi: number;
  secondary_radius_mi: number;
  population: number;
  median_hhi: number;
  avg_age: number;
  daytime_population?: number;
  top_origins?: Array<{
    name: string;
    pct: number;
  }>;
  competitor_density?: number;
  fetched_at: string;
}

interface PlacerBenchmark {
  venue_name: string;
  category: string;
  visits_index: number;
  yoy_change_pct?: number;
}

// ── HTTP helpers ─────────────────────────────────────────────

/**
 * Make an authenticated request to the Placer.ai API.
 * Returns the parsed JSON on success, or throws with a descriptive message.
 */
async function placerFetch(
  path: string,
  apiKey: string,
  params?: Record<string, string>,
): Promise<unknown> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (res.status === 401) {
    throw new Error("Placer.ai API key is invalid or expired (HTTP 401).");
  }
  if (res.status === 403) {
    throw new Error(
      "Placer.ai API access denied (HTTP 403). Your subscription may not include API access.",
    );
  }
  if (res.status === 429) {
    throw new Error("Placer.ai API rate limit exceeded (HTTP 429). Try again later.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Placer.ai API returned HTTP ${res.status}: ${body.slice(0, 200)}`,
    );
  }

  return res.json();
}

/**
 * Validate a Placer.ai API key by making a lightweight test request.
 * Returns null on success, or an error message on failure.
 */
async function validateKey(apiKey: string): Promise<string | null> {
  try {
    // Use the foot traffic endpoint with a well-known location as a validation probe.
    // Limit to minimal data to keep the request lightweight.
    await placerFetch("/foot-traffic", apiKey, {
      lat: "40.7128",
      lng: "-74.0060",
      limit: "1",
    });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Unknown validation error";
  }
}

// ── Foot traffic query ──────────────────────────────────────

/**
 * Pull foot traffic data from Placer.ai for a given location.
 * Returns null if the API call fails or returns no data.
 */
async function fetchFootTraffic(
  apiKey: string,
  lat: number,
  lng: number,
  radiusMi: number,
): Promise<{ data: FootTrafficData | null; raw: unknown; error?: string }> {
  try {
    const raw = await placerFetch("/foot-traffic", apiKey, {
      lat: String(lat),
      lng: String(lng),
      radius_mi: String(radiusMi),
    });
    const r = raw as Record<string, unknown>;

    // Parse peak hours from API response
    const rawPeakHours = r.peak_hours;
    const peakHours: Array<{ hour: number; avg_visits: number }> = [];
    if (Array.isArray(rawPeakHours)) {
      for (const ph of rawPeakHours) {
        const entry = ph as Record<string, unknown>;
        if (typeof entry.hour === "number" && typeof entry.avg_visits === "number") {
          peakHours.push({ hour: entry.hour, avg_visits: entry.avg_visits });
        }
      }
    }

    // Parse demographics if available
    let demographics: FootTrafficData["visitor_demographics"];
    const rawDemo = r.visitor_demographics || r.demographics;
    if (rawDemo && typeof rawDemo === "object") {
      const d = rawDemo as Record<string, unknown>;
      demographics = {
        median_hhi: typeof d.median_hhi === "number" ? d.median_hhi : undefined,
        age_distribution:
          d.age_distribution && typeof d.age_distribution === "object"
            ? (d.age_distribution as Record<string, number>)
            : undefined,
        gender_split:
          d.gender_split && typeof d.gender_split === "object"
            ? (d.gender_split as { male: number; female: number })
            : undefined,
      };
    }

    const data: FootTrafficData = {
      location: { lat, lng },
      daily_visits_avg: typeof r.daily_visits_avg === "number" ? r.daily_visits_avg : 0,
      weekly_visits_avg: typeof r.weekly_visits_avg === "number" ? r.weekly_visits_avg : 0,
      peak_hours: peakHours,
      visitor_demographics: demographics,
      trade_area_radius_mi: radiusMi,
      fetched_at: new Date().toISOString(),
    };

    return { data, raw };
  } catch (err) {
    return {
      data: null,
      raw: null,
      error: err instanceof Error ? err.message : "Failed to fetch foot traffic",
    };
  }
}

// ── Trade area query ─────────────────────────────────────────

/**
 * Pull trade area demographics from Placer.ai for a given location.
 * Returns null if the API call fails or returns no data.
 */
async function fetchTradeArea(
  apiKey: string,
  lat: number,
  lng: number,
): Promise<{ data: TradeAreaData | null; raw: unknown; error?: string }> {
  try {
    const raw = await placerFetch("/trade-area", apiKey, {
      lat: String(lat),
      lng: String(lng),
    });
    const r = raw as Record<string, unknown>;

    // Parse top origins if available
    const rawOrigins = r.top_origins;
    const topOrigins: Array<{ name: string; pct: number }> = [];
    if (Array.isArray(rawOrigins)) {
      for (const o of rawOrigins) {
        const entry = o as Record<string, unknown>;
        if (typeof entry.name === "string" && typeof entry.pct === "number") {
          topOrigins.push({ name: entry.name, pct: entry.pct });
        }
      }
    }

    const data: TradeAreaData = {
      location: { lat, lng },
      primary_radius_mi:
        typeof r.primary_radius_mi === "number" ? r.primary_radius_mi : 1,
      secondary_radius_mi:
        typeof r.secondary_radius_mi === "number" ? r.secondary_radius_mi : 3,
      population: typeof r.population === "number" ? r.population : 0,
      median_hhi: typeof r.median_hhi === "number" ? r.median_hhi : 0,
      avg_age: typeof r.avg_age === "number" ? r.avg_age : 0,
      daytime_population:
        typeof r.daytime_population === "number" ? r.daytime_population : undefined,
      top_origins: topOrigins.length > 0 ? topOrigins : undefined,
      competitor_density:
        typeof r.competitor_density === "number" ? r.competitor_density : undefined,
      fetched_at: new Date().toISOString(),
    };

    return { data, raw };
  } catch (err) {
    return {
      data: null,
      raw: null,
      error: err instanceof Error ? err.message : "Failed to fetch trade area",
    };
  }
}

// ── Benchmarks query ─────────────────────────────────────────

async function fetchBenchmarks(
  apiKey: string,
  lat: number,
  lng: number,
): Promise<{ items: PlacerBenchmark[]; raw: unknown; error?: string }> {
  try {
    const raw = await placerFetch("/benchmarks", apiKey, {
      lat: String(lat),
      lng: String(lng),
    });
    const results = Array.isArray(raw)
      ? raw
      : (raw as Record<string, unknown>)?.results;
    const items: PlacerBenchmark[] = (Array.isArray(results) ? results : []).map(
      (r: Record<string, unknown>) => ({
        venue_name: String(r.venue_name || r.name || ""),
        category: String(r.category || ""),
        visits_index: typeof r.visits_index === "number" ? r.visits_index : 0,
        yoy_change_pct:
          typeof r.yoy_change_pct === "number" ? r.yoy_change_pct : undefined,
      }),
    );
    return { items, raw };
  } catch (err) {
    return {
      items: [],
      raw: null,
      error: err instanceof Error ? err.message : "Failed to fetch benchmarks",
    };
  }
}

// ── Adapter ──────────────────────────────────────────────────

function makePlacerAiAdapter(): IntegrationAdapter {
  const provider = getProvider(PROVIDER_ID);
  if (!provider) throw new Error(`Unknown provider '${PROVIDER_ID}'`);

  return {
    provider,

    async connect(input: ConnectInput): Promise<ConnectResult> {
      if (!input.api_key) {
        throw new Error("API key is required");
      }

      const error = await validateKey(input.api_key);
      if (error) {
        throw new Error(`Invalid Placer.ai API key: ${error}`);
      }

      return {
        credentials: {
          api_key: input.api_key,
          validated_at: new Date().toISOString(),
        },
        external_account_id: null,
        external_account_name: "Placer.ai",
      };
    },

    async sync(connection: ConnectionRow): Promise<SyncResult> {
      const creds = connection.credentials as Record<string, string>;
      const apiKey = creds?.api_key;
      if (!apiKey) {
        return {
          records_pulled: 0,
          records_upserted: 0,
          records_skipped: 0,
          errors_count: 1,
          cursor: {},
          error_text: "No API key found in stored credentials.",
        };
      }

      // Placer.ai is primarily query-on-demand. Sync validates the key
      // and optionally pre-caches data for configured locations.
      const error = await validateKey(apiKey);
      if (error) {
        return {
          records_pulled: 0,
          records_upserted: 0,
          records_skipped: 0,
          errors_count: 1,
          cursor: { validated_at: new Date().toISOString() },
          error_text: `API key validation failed: ${error}`,
        };
      }

      // If the workspace has configured locations to pre-cache, sync them.
      const locations: Array<{ lat: number; lng: number }> =
        Array.isArray(connection.sync_state?.locations)
          ? connection.sync_state.locations
          : [];

      if (locations.length === 0) {
        return {
          records_pulled: 0,
          records_upserted: 0,
          records_skipped: 0,
          errors_count: 0,
          cursor: {
            validated_at: new Date().toISOString(),
            note: "API key valid. Placer.ai data is queried on demand by Dante tools. Add locations to sync_state to pre-cache.",
          },
        };
      }

      // Pre-cache foot traffic for configured locations
      let totalPulled = 0;
      let totalErrors = 0;
      const syncErrors: string[] = [];
      const locationResults: Record<string, unknown> = {};

      for (const loc of locations.slice(0, 10)) {
        const [traffic, tradeArea] = await Promise.all([
          fetchFootTraffic(apiKey, loc.lat, loc.lng, 1),
          fetchTradeArea(apiKey, loc.lat, loc.lng),
        ]);

        const key = `${loc.lat.toFixed(4)},${loc.lng.toFixed(4)}`;
        locationResults[key] = {
          foot_traffic: traffic.data,
          trade_area: tradeArea.data,
        };

        if (traffic.data) totalPulled++;
        if (tradeArea.data) totalPulled++;
        if (traffic.error) {
          totalErrors++;
          syncErrors.push(`[${key}] foot_traffic: ${traffic.error}`);
        }
        if (tradeArea.error) {
          totalErrors++;
          syncErrors.push(`[${key}] trade_area: ${tradeArea.error}`);
        }
      }

      return {
        records_pulled: totalPulled,
        records_upserted: totalPulled,
        records_skipped: 0,
        errors_count: totalErrors,
        cursor: {
          synced_at: new Date().toISOString(),
          locations: locationResults,
        },
        error_text: syncErrors.length > 0 ? syncErrors.join("; ") : undefined,
      };
    },
  };
}

// ── Exported query functions for Dante tools ─────────────────
//
// These resolve the workspace's Placer.ai API key from
// integration_connections and query the API on demand.

/**
 * Resolve the Placer.ai API key for a workspace.
 * Returns null if no connected integration exists.
 */
async function resolveApiKey(workspaceId: string): Promise<string | null> {
  try {
    const { data: conn } = await supabaseAdmin
      .from("integration_connections")
      .select("credentials")
      .eq("workspace_id", workspaceId)
      .eq("provider", PROVIDER_ID)
      .eq("status", "connected")
      .maybeSingle();
    if (conn) {
      const creds = conn.credentials as Record<string, string>;
      if (creds.api_key) return creds.api_key;
    }
  } catch {
    // Fall through
  }
  return null;
}

/**
 * Query foot traffic data from Placer.ai for a given location.
 *
 * The workspace must have a connected Placer.ai integration with a valid API key.
 * Returns null if no connection exists or the query fails.
 *
 * @param workspaceId - The workspace UUID
 * @param params      - Location coordinates and optional radius
 * @returns Foot traffic data or null
 */
export async function queryFootTraffic(
  workspaceId: string,
  params: { lat: number; lng: number; radius_mi?: number },
): Promise<FootTrafficData | null> {
  const apiKey = await resolveApiKey(workspaceId);
  if (!apiKey) {
    console.warn(
      `[placer-ai] No connected Placer.ai integration for workspace ${workspaceId}`,
    );
    return null;
  }

  const radiusMi = params.radius_mi ?? 1;
  const result = await fetchFootTraffic(apiKey, params.lat, params.lng, radiusMi);
  if (result.error) {
    console.error(
      `[placer-ai] Failed to query foot traffic for workspace ${workspaceId}:`,
      result.error,
    );
  }
  return result.data;
}

/**
 * Query trade area demographics from Placer.ai for a given location.
 *
 * The workspace must have a connected Placer.ai integration with a valid API key.
 * Returns null if no connection exists or the query fails.
 *
 * @param workspaceId - The workspace UUID
 * @param params      - Location coordinates
 * @returns Trade area data or null
 */
export async function queryTradeArea(
  workspaceId: string,
  params: { lat: number; lng: number },
): Promise<TradeAreaData | null> {
  const apiKey = await resolveApiKey(workspaceId);
  if (!apiKey) {
    console.warn(
      `[placer-ai] No connected Placer.ai integration for workspace ${workspaceId}`,
    );
    return null;
  }

  const result = await fetchTradeArea(apiKey, params.lat, params.lng);
  if (result.error) {
    console.error(
      `[placer-ai] Failed to query trade area for workspace ${workspaceId}:`,
      result.error,
    );
  }
  return result.data;
}

export { makePlacerAiAdapter };

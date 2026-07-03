// lib/integrations/adapters/costar.ts
//
// CoStar API adapter for CRE market intelligence.
//
// CoStar provides lease comps, active listings, market analytics, and
// tenant data. Their API requires an enterprise subscription and is not
// publicly documented -- the endpoint patterns here follow the standard
// REST conventions described in their partner integration guides.
//
// IMPORTANT: CoStar's Terms of Service restrict redistribution of their
// data. This adapter caches results in integration_sync_runs for
// workspace-internal use only. Do not expose raw CoStar data through
// public-facing endpoints.
//
// Connect: validates the API key with a lightweight test request.
// Sync:    pulls comps, listings, and market analytics for configured markets.
//
// Exported query functions are consumed by Dante agent tools to enrich
// void analysis and due diligence workflows.

import type {
  IntegrationAdapter,
  ConnectInput,
  ConnectResult,
  SyncResult,
  ConnectionRow,
} from "../adapter";
import { getProvider } from "../registry";
import { supabaseAdmin } from "@/lib/supabase/admin";

const PROVIDER_ID = "costar";
const API_BASE = "https://api.costar.com/v1";
const REQUEST_TIMEOUT_MS = 15_000;

// ── Types ────────────────────────────────────────────────────

export interface CoStarComp {
  id: string;
  address: string;
  market: string;
  property_type: string;
  lease_type?: string;
  tenant_name?: string;
  sf?: number;
  rate_psf?: number;
  lease_date?: string;
  raw: Record<string, unknown>;
}

export interface CoStarListing {
  id: string;
  address: string;
  market: string;
  property_type: string;
  status: string;
  asking_rate_psf?: number;
  available_sf?: number;
  raw: Record<string, unknown>;
}

export interface CoStarMarketAnalytics {
  market_id: string;
  vacancy_rate?: number;
  avg_asking_rate?: number;
  absorption_sf?: number;
  inventory_sf?: number;
  under_construction_sf?: number;
  raw: Record<string, unknown>;
}

// ── HTTP helpers ─────────────────────────────────────────────

/**
 * Make an authenticated request to the CoStar API.
 * Returns the parsed JSON on success, or throws with a descriptive message.
 */
async function costarFetch(
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
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (res.status === 401) {
    throw new Error("CoStar API key is invalid or expired (HTTP 401).");
  }
  if (res.status === 403) {
    throw new Error(
      "CoStar API access denied (HTTP 403). Your subscription may not include API access, or TOS acceptance is required.",
    );
  }
  if (res.status === 429) {
    throw new Error("CoStar API rate limit exceeded (HTTP 429). Try again later.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `CoStar API returned HTTP ${res.status}: ${body.slice(0, 200)}`,
    );
  }

  return res.json();
}

/**
 * Validate a CoStar API key by making a lightweight test request.
 * Returns null on success, or an error message on failure.
 */
async function validateKey(apiKey: string): Promise<string | null> {
  try {
    // Use a minimal endpoint to confirm the key is valid.
    // The /comps endpoint with limit=1 is the lightest call
    // that exercises real authentication.
    await costarFetch("/comps", apiKey, { limit: "1" });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Unknown validation error";
  }
}

// ── Sync helpers ─────────────────────────────────────────────

async function pullComps(
  apiKey: string,
  marketId: string,
): Promise<{ items: CoStarComp[]; raw: unknown; error?: string }> {
  try {
    const data = await costarFetch("/comps", apiKey, {
      market: marketId,
      limit: "100",
    });
    const results = Array.isArray(data) ? data : (data as Record<string, unknown>)?.results;
    const items: CoStarComp[] = (Array.isArray(results) ? results : []).map(
      (r: Record<string, unknown>) => ({
        id: String(r.id || r.comp_id || ""),
        address: String(r.address || ""),
        market: String(r.market || marketId),
        property_type: String(r.property_type || ""),
        lease_type: r.lease_type ? String(r.lease_type) : undefined,
        tenant_name: r.tenant_name ? String(r.tenant_name) : undefined,
        sf: typeof r.sf === "number" ? r.sf : undefined,
        rate_psf: typeof r.rate_psf === "number" ? r.rate_psf : undefined,
        lease_date: r.lease_date ? String(r.lease_date) : undefined,
        raw: r,
      }),
    );
    return { items, raw: data };
  } catch (err) {
    return {
      items: [],
      raw: null,
      error: err instanceof Error ? err.message : "Failed to pull comps",
    };
  }
}

async function pullListings(
  apiKey: string,
  marketId: string,
): Promise<{ items: CoStarListing[]; raw: unknown; error?: string }> {
  try {
    const data = await costarFetch("/listings", apiKey, {
      market: marketId,
      status: "active",
      limit: "100",
    });
    const results = Array.isArray(data) ? data : (data as Record<string, unknown>)?.results;
    const items: CoStarListing[] = (Array.isArray(results) ? results : []).map(
      (r: Record<string, unknown>) => ({
        id: String(r.id || r.listing_id || ""),
        address: String(r.address || ""),
        market: String(r.market || marketId),
        property_type: String(r.property_type || ""),
        status: String(r.status || "active"),
        asking_rate_psf:
          typeof r.asking_rate_psf === "number" ? r.asking_rate_psf : undefined,
        available_sf:
          typeof r.available_sf === "number" ? r.available_sf : undefined,
        raw: r,
      }),
    );
    return { items, raw: data };
  } catch (err) {
    return {
      items: [],
      raw: null,
      error: err instanceof Error ? err.message : "Failed to pull listings",
    };
  }
}

async function pullMarketAnalytics(
  apiKey: string,
  marketId: string,
): Promise<{ data: CoStarMarketAnalytics | null; raw: unknown; error?: string }> {
  try {
    const raw = await costarFetch(`/analytics/market/${encodeURIComponent(marketId)}`, apiKey);
    const r = raw as Record<string, unknown>;
    const analytics: CoStarMarketAnalytics = {
      market_id: marketId,
      vacancy_rate: typeof r.vacancy_rate === "number" ? r.vacancy_rate : undefined,
      avg_asking_rate: typeof r.avg_asking_rate === "number" ? r.avg_asking_rate : undefined,
      absorption_sf: typeof r.absorption_sf === "number" ? r.absorption_sf : undefined,
      inventory_sf: typeof r.inventory_sf === "number" ? r.inventory_sf : undefined,
      under_construction_sf:
        typeof r.under_construction_sf === "number" ? r.under_construction_sf : undefined,
      raw: r,
    };
    return { data: analytics, raw };
  } catch (err) {
    return {
      data: null,
      raw: null,
      error: err instanceof Error ? err.message : "Failed to pull market analytics",
    };
  }
}

// ── Adapter ──────────────────────────────────────────────────

function makeCoStarAdapter(): IntegrationAdapter {
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
        throw new Error(`Invalid CoStar API key: ${error}`);
      }

      return {
        credentials: {
          api_key: input.api_key,
          validated_at: new Date().toISOString(),
        },
        external_account_id: null,
        external_account_name: "CoStar",
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

      // Determine which markets to sync. The workspace may have configured
      // market IDs in the sync_state, or we fall back to a validation-only run.
      const marketIds: string[] =
        Array.isArray(connection.sync_state?.market_ids)
          ? connection.sync_state.market_ids
          : [];

      if (marketIds.length === 0) {
        // No markets configured -- validate the key and report back.
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
        return {
          records_pulled: 0,
          records_upserted: 0,
          records_skipped: 0,
          errors_count: 0,
          cursor: {
            validated_at: new Date().toISOString(),
            note: "No market IDs configured. Add market_ids to sync_state to pull data.",
          },
        };
      }

      // Pull data for each configured market
      let totalPulled = 0;
      let totalUpserted = 0;
      const totalSkipped = 0;
      let totalErrors = 0;
      const errors: string[] = [];
      const syncDetails: Record<string, unknown> = {};

      for (const marketId of marketIds) {
        const [comps, listings, analytics] = await Promise.all([
          pullComps(apiKey, marketId),
          pullListings(apiKey, marketId),
          pullMarketAnalytics(apiKey, marketId),
        ]);

        const marketPulled =
          comps.items.length + listings.items.length + (analytics.data ? 1 : 0);
        totalPulled += marketPulled;

        // Store raw responses in sync_state for debugging
        syncDetails[marketId] = {
          comps_count: comps.items.length,
          listings_count: listings.items.length,
          has_analytics: !!analytics.data,
          comps_raw: comps.raw,
          listings_raw: listings.raw,
          analytics_raw: analytics.raw,
        };

        if (comps.error) {
          totalErrors++;
          errors.push(`[${marketId}] comps: ${comps.error}`);
        }
        if (listings.error) {
          totalErrors++;
          errors.push(`[${marketId}] listings: ${listings.error}`);
        }
        if (analytics.error) {
          totalErrors++;
          errors.push(`[${marketId}] analytics: ${analytics.error}`);
        }

        // Upsert comps and listings into integration_sync_runs metadata.
        // Since there is no dedicated costar_cache table, we store results
        // on the sync run itself (via the cursor / metadata). The runner
        // writes cursor to integration_sync_runs.metadata automatically.
        totalUpserted += comps.items.length + listings.items.length;
      }

      return {
        records_pulled: totalPulled,
        records_upserted: totalUpserted,
        records_skipped: totalSkipped,
        errors_count: totalErrors,
        cursor: {
          synced_at: new Date().toISOString(),
          markets: syncDetails,
        },
        error_text: errors.length > 0 ? errors.join("; ") : undefined,
      };
    },
  };
}

// ── Exported query function for Dante tools ──────────────────
//
// Called by Dante's agent tools to pull lease comps on demand for
// void analysis. Resolves the workspace's stored CoStar API key
// from integration_connections, then queries the CoStar API.

/**
 * Query CoStar lease comps for a given address or market.
 *
 * The workspace must have a connected CoStar integration with a valid API key.
 * Returns an empty array if no connection exists or the query fails.
 *
 * @param workspaceId - The workspace UUID
 * @param params      - Search parameters (address and/or market ID)
 * @returns Array of lease comp records from CoStar
 */
export async function queryCoStarComps(
  workspaceId: string,
  params: { address?: string; market?: string },
): Promise<CoStarComp[]> {
  // Resolve the API key from integration_connections
  let apiKey: string | null = null;
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
      if (creds.api_key) apiKey = creds.api_key;
    }
  } catch {
    // Fall through -- no connection available
  }

  if (!apiKey) {
    console.warn(
      `[costar] No connected CoStar integration for workspace ${workspaceId}`,
    );
    return [];
  }

  // Build query params
  const queryParams: Record<string, string> = { limit: "100" };
  if (params.market) queryParams.market = params.market;
  if (params.address) queryParams.address = params.address;

  try {
    const data = await costarFetch("/comps", apiKey, queryParams);
    const results = Array.isArray(data)
      ? data
      : (data as Record<string, unknown>)?.results;

    return (Array.isArray(results) ? results : []).map(
      (r: Record<string, unknown>) => ({
        id: String(r.id || r.comp_id || ""),
        address: String(r.address || ""),
        market: String(r.market || params.market || ""),
        property_type: String(r.property_type || ""),
        lease_type: r.lease_type ? String(r.lease_type) : undefined,
        tenant_name: r.tenant_name ? String(r.tenant_name) : undefined,
        sf: typeof r.sf === "number" ? r.sf : undefined,
        rate_psf: typeof r.rate_psf === "number" ? r.rate_psf : undefined,
        lease_date: r.lease_date ? String(r.lease_date) : undefined,
        raw: r,
      }),
    );
  } catch (err) {
    console.error(
      `[costar] Failed to query comps for workspace ${workspaceId}:`,
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

export { makeCoStarAdapter };

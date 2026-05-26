// lib/integrations/adapters/google-maps.ts
//
// Google Maps Platform adapter. This is NOT a data-sync connector --
// Google Maps is a query-on-demand service (geocoding, places, distance
// matrix). The stored API key is consumed at runtime by:
//
//   - lib/site-scan/tools.ts      (void analysis, site scans)
//   - lib/dante/workflow-runner.ts (due diligence workflows)
//   - lib/data-sources/google-maps.ts (geocode / nearby / distance)
//
// Connect: validates the key with a test geocode call.
// Sync:    validates the key is still active. No records to pull.

import type {
  IntegrationAdapter,
  ConnectInput,
  ConnectResult,
  SyncResult,
  ConnectionRow,
} from "../adapter";
import { getProvider } from "../registry";

const PROVIDER_ID = "google_maps";
const TEST_ADDRESS = "1600 Amphitheatre Parkway, Mountain View, CA";
const GEO_BASE = "https://maps.googleapis.com/maps/api/geocode/json";

/**
 * Validate a Google Maps API key by making a test geocode call.
 * Returns null on success, or an error message on failure.
 */
async function validateKey(apiKey: string): Promise<string | null> {
  try {
    const url = `${GEO_BASE}?address=${encodeURIComponent(TEST_ADDRESS)}&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      return `Google Maps API returned HTTP ${res.status}`;
    }
    const data = await res.json();
    if (data.status === "OK" && data.results?.length > 0) {
      return null; // success
    }
    if (data.status === "REQUEST_DENIED") {
      return data.error_message || "API key denied -- check that Geocoding API is enabled.";
    }
    if (data.status === "OVER_QUERY_LIMIT") {
      return "API key is over its query limit.";
    }
    return `Geocode test returned status: ${data.status}`;
  } catch (err) {
    return `Network error: ${err instanceof Error ? err.message : "request failed"}`;
  }
}

function makeGoogleMapsAdapter(): IntegrationAdapter {
  const provider = getProvider(PROVIDER_ID);
  if (!provider) throw new Error(`Unknown provider '${PROVIDER_ID}'`);

  return {
    provider,

    async connect(input: ConnectInput): Promise<ConnectResult> {
      if (!input.api_key) {
        throw new Error("API key is required");
      }

      // Validate the key before storing
      const error = await validateKey(input.api_key);
      if (error) {
        throw new Error(`Invalid API key: ${error}`);
      }

      return {
        credentials: { api_key: input.api_key },
        external_account_id: null,
        external_account_name: "Google Maps Platform",
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

      // Validate the key is still working
      const error = await validateKey(apiKey);
      if (error) {
        return {
          records_pulled: 0,
          records_upserted: 0,
          records_skipped: 0,
          errors_count: 1,
          cursor: {},
          error_text: `API key validation failed: ${error}`,
        };
      }

      // Google Maps is query-on-demand -- no records to sync.
      // The key is used at runtime by site_scan tools and workflows.
      return {
        records_pulled: 0,
        records_upserted: 0,
        records_skipped: 0,
        errors_count: 0,
        cursor: {},
      };
    },
  };
}

export { makeGoogleMapsAdapter };

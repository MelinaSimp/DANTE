// lib/site-scan/tools.ts
// Agent tool handlers for Site Scan: search, detail, listings.

import { geocodeAddress } from "./enrichment/geocoder";
import { getCensusDemographics } from "./enrichment/census";
import { checkBrownfield } from "./enrichment/epa";
import { estimateTax } from "./tax";
import { getCachedOrFetch } from "./cache";
import {
  getAdapter,
  getDetailAdapter,
  hasDetailCoverage,
} from "./adapters/registry";
import { upsertParcel, findParcel } from "./parcels";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { CountyAdapterConfig } from "./adapters/types";
import { ArcGISError, CircuitOpenError } from "./adapters/resilience";
import {
  nearbyPlaces,
  type NearbyPlace,
  surveyNearbyBusinesses,
  type SurveyBusiness,
  type SurveyResult,
  geocodeAddress as gmapsGeocode,
} from "@/lib/data-sources/google-maps";

/**
 * Build a real URL to the ArcGIS REST HTML view for a specific parcel.
 * This renders a human-readable page with the parcel's record data.
 */
function buildParcelSourceUrl(
  config: CountyAdapterConfig,
  parcelNumber: string,
): string {
  const parcelField = config.fieldMap.parcel_number;
  const escaped = parcelNumber.replace(/'/g, "''");
  return (
    `${config.serviceUrl}/${config.layerId}/query` +
    `?where=${encodeURIComponent(`${parcelField}='${escaped}'`)}` +
    `&outFields=*&f=html`
  );
}

// ---- site_scan.search ----------------------------------------

export async function handleSiteScanSearch(
  args: {
    location: string;
    zoning?: string[];
    acreage_min?: number;
    acreage_max?: number;
    land_use?: string;
    max_results?: number;
  },
  workspaceId: string,
): Promise<string> {
  // 1. Geocode the location string
  const geo = await geocodeAddress(args.location);
  if (!geo) {
    return JSON.stringify({
      error:
        "Could not geocode that location. Try a full street address or city + state.",
    });
  }

  // 2. Resolve county adapter
  let adapter;
  try {
    adapter = getAdapter(geo.state, geo.county);
  } catch {
    return JSON.stringify({
      error: `No parcel data available for ${geo.county}, ${geo.state} yet. Coverage is expanding.`,
      location_resolved: geo.matched_address,
    });
  }
  const zoningConfig = adapter.config.zoningClassMap;

  // Resolve natural-language zoning ("retail") to codes. Callers pass
  // either an array or a bare string (workflow nodes, direct API use) —
  // normalize before mapping so a string doesn't crash the search.
  const rawZoning = args.zoning as unknown;
  let zoningCodes = Array.isArray(rawZoning)
    ? (rawZoning as string[])
    : typeof rawZoning === "string" && rawZoning.trim()
      ? [rawZoning.trim()]
      : undefined;
  if (zoningCodes && zoningConfig) {
    zoningCodes = zoningCodes.flatMap((z) => {
      const mapped = zoningConfig[z.toLowerCase()];
      return mapped ?? [z];
    });
  }

  // Resolve land_use through the adapter's zoning map
  let landUseCodes: string[] | undefined;
  if (args.land_use === "vacant" && zoningConfig?.vacant) {
    landUseCodes = zoningConfig.vacant;
  }

  // 3. Query — with error propagation to the agent
  let parcels;
  try {
    parcels = await adapter.searchParcels({
      center: { lat: geo.lat, lng: geo.lng },
      radiusMeters: 8047, // 5 miles
      zoning: zoningCodes,
      acreageMin: args.acreage_min,
      acreageMax: args.acreage_max,
      landUse: landUseCodes,
      maxResults: args.max_results ?? 20,
    });
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return JSON.stringify({
        error: `${geo.county} County GIS is temporarily unreachable. Try again in a few minutes.`,
        data_source_status: "unavailable",
        location_resolved: geo.matched_address,
      });
    }
    if (err instanceof ArcGISError) {
      return JSON.stringify({
        error: `${geo.county} County GIS returned an error (HTTP ${err.httpStatus ?? "unknown"}). The data source may be down.`,
        data_source_status: "error",
        location_resolved: geo.matched_address,
      });
    }
    throw err;
  }

  // 4. Upsert parcels into DB (fire and forget — don't block the response)
  for (const p of parcels) {
    await upsertParcel(workspaceId, p);
  }

  const detailAvailable =
    parcels.length > 0 &&
    hasDetailCoverage(parcels[0].state, parcels[0].county);

  const sourceName =
    adapter.config.county === "*"
      ? `${geo.state} Statewide Parcel Database`
      : `${adapter.config.county} County Auditor`;
  const accessedAt = new Date().toISOString();

  // Build citation markers
  const citations = parcels.map((p, i) => ({
    marker: `[ss:${i + 1}]`,
    index: i + 1,
    parcel_number: p.parcel_number,
    address: p.address || "",
    county: p.county ?? geo.county,
    state: p.state ?? geo.state,
    source: sourceName,
    source_url: buildParcelSourceUrl(adapter.config, p.parcel_number),
    accessed_at: accessedAt,
  }));

  return JSON.stringify({
    location_resolved: geo.matched_address,
    county: geo.county,
    state: geo.state,
    results_count: parcels.length,
    detail_coverage: detailAvailable
      ? "Full parcel detail available for this county"
      : "Basic record only -- full detail not yet available for this county",
    citations,
    parcels: parcels.map((p, i) => ({
      citation: `[ss:${i + 1}]`,
      parcel_number: p.parcel_number,
      address: p.address,
      zoning: p.zoning_class,
      zoning_desc: p.zoning_description,
      acreage: Math.round(p.land_area_acres * 100) / 100,
      assessed_value: p.assessed_value_total,
      land_use: p.land_use_description,
    })),
    source: sourceName,
    accessed_at: accessedAt,
    caveat:
      "Parcel data from public county records. Zoning, assessed values, and land use " +
      "may not reflect recent changes. Confirm with the local municipality before acting.",
    citation_instruction:
      "Cite each parcel using its [ss:N] marker inline when presenting these results.",
  });
}

// ---- site_scan.detail ----------------------------------------

export async function handleSiteScanDetail(
  args: {
    parcel_number?: string;
    address?: string;
    county?: string;
    state?: string;
  },
  workspaceId: string,
): Promise<string> {
  let parcelNumber = args.parcel_number;
  let county = args.county;
  let state = args.state;

  // If address given, geocode first
  if (!parcelNumber && args.address) {
    const geo = await geocodeAddress(args.address);
    if (!geo) {
      return JSON.stringify({ error: "Could not geocode address." });
    }
    county = geo.county;
    state = geo.state;
    // Get parcel by address via adapter search
    try {
      const adapter = getAdapter(state, county);
      const matches = await adapter.searchParcels({
        center: { lat: geo.lat, lng: geo.lng },
        radiusMeters: 100,
        maxResults: 1,
      });
      if (!matches.length) {
        return JSON.stringify({
          error: "No parcel found at that address.",
        });
      }
      parcelNumber = matches[0].parcel_number;
      // Upsert so we have it in DB
      await upsertParcel(workspaceId, matches[0]);
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        return JSON.stringify({
          error: `${county} County GIS is temporarily unreachable. Try again in a few minutes.`,
          data_source_status: "unavailable",
        });
      }
      if (err instanceof ArcGISError) {
        return JSON.stringify({
          error: `${county} County GIS returned an error (HTTP ${err.httpStatus ?? "unknown"}).`,
          data_source_status: "error",
        });
      }
      return JSON.stringify({
        error: `No parcel data available for ${county} County, ${state} yet.`,
      });
    }
  }

  if (!parcelNumber || !county || !state) {
    return JSON.stringify({
      error:
        "Need parcel_number + county + state, or a street address.",
    });
  }

  // Get or verify parcel record
  const parcelId = await findParcel(
    workspaceId,
    parcelNumber,
    county,
    state,
  );
  if (!parcelId) {
    return JSON.stringify({
      error:
        "Parcel not found in workspace. Run site_scan.search first.",
    });
  }

  // Assemble data from all sources via cache
  const detailAdapter = getDetailAdapter(state, county);
  const sections: Record<string, any> = {};

  // Auditor data
  if (detailAdapter) {
    try {
      const auditor = await getCachedOrFetch(
        parcelId,
        "auditor",
        async () => {
          const data =
            await detailAdapter.getParcelDetail(parcelNumber!);
          return {
            data,
            source_url: buildParcelSourceUrl(detailAdapter.config, parcelNumber!),
          };
        },
      );
      sections.auditor = {
        ...auditor.data,
        _source: `${county} County Auditor`,
        _accessed: auditor.fetched_at,
        _source_url: auditor.source_url,
      };

      // Tax estimate (derived)
      sections.tax_estimate = estimateTax(auditor.data, undefined, state);
    } catch (err) {
      console.warn("[site_scan.detail] auditor fetch failed:", err);
      if (err instanceof CircuitOpenError) {
        sections.auditor_error = {
          status: "unavailable",
          detail: `${county} County GIS is temporarily unreachable.`,
        };
      } else if (err instanceof ArcGISError) {
        sections.auditor_error = {
          status: "error",
          detail: `${county} County GIS returned an error (HTTP ${err.httpStatus ?? "unknown"}).`,
        };
      } else {
        sections.auditor_error = {
          status: "error",
          detail: `Could not fetch auditor data: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }
  }

  // Demographics
  const addressForGeo =
    sections.auditor?.address ?? args.address ?? "";
  const geo = addressForGeo
    ? await geocodeAddress(addressForGeo)
    : null;

  if (geo?.census_tract) {
    try {
      const census = await getCachedOrFetch(
        parcelId,
        "census",
        async () => {
          const data = await getCensusDemographics(
            geo!.census_tract,
            geo!.state,
            geo!.county,
          );
          return {
            data,
            source_url:
              "https://data.census.gov (ACS 5-Year Estimates)",
          };
        },
      );
      sections.demographics = {
        ...census.data,
        census_tract: geo.census_tract,
        _source:
          "U.S. Census Bureau, ACS 5-Year Estimates (2019-2023)",
        _accessed: census.fetched_at,
      };
    } catch (err) {
      console.warn("[site_scan.detail] census fetch failed:", err);
    }
  }

  // Environmental
  if (geo) {
    try {
      const epa = await getCachedOrFetch(
        parcelId,
        "epa",
        async () => {
          const data = await checkBrownfield(geo!.lat, geo!.lng);
          return { data, source_url: data.source_url };
        },
      );
      sections.environmental = {
        brownfield_sites_nearby: epa.data.found,
        sites: epa.data.sites,
        _source: "EPA Facility Registry Service (FRS)",
        _accessed: epa.fetched_at,
        _source_url: epa.source_url,
      };
    } catch (err) {
      console.warn("[site_scan.detail] epa fetch failed:", err);
    }
  }

  // Linked vault documents
  const { data: linkedDocs } = await supabaseAdmin
    .from("parcel_documents")
    .select("document_id")
    .eq("parcel_id", parcelId);

  sections.linked_documents = (linkedDocs ?? []).map((d: any) => ({
    id: d.document_id,
  }));

  return JSON.stringify({
    parcel_number: parcelNumber,
    county,
    state,
    sections,
    caveat:
      "Data sourced from public records. Assessed values, zoning, and environmental " +
      "status may not reflect recent changes. All data points include their source and " +
      "access date. Verify critical information with the relevant authority before acting.",
  });
}

// ---- site_scan.void_analysis ---------------------------------

// ── Market gap analysis via Google Maps Places ────────────────
//
// For each corridor anchor point, query Google Maps for existing
// businesses in categories related to the target use. Count by
// category and identify underserved segments (the actual "void").

const TARGET_USE_TO_PLACE_TYPES: Record<string, string[]> = {
  "grocery":          ["supermarket", "grocery_or_supermarket"],
  "retail":           ["shopping_mall", "department_store", "clothing_store", "supermarket"],
  "retail strip center": ["shopping_mall", "department_store", "clothing_store", "supermarket", "restaurant"],
  "restaurant":       ["restaurant", "cafe", "meal_takeaway", "meal_delivery"],
  "medical":          ["hospital", "doctor", "dentist", "pharmacy", "physiotherapist"],
  "medical office":   ["hospital", "doctor", "dentist", "pharmacy"],
  "fitness":          ["gym"],
  "gas station":      ["gas_station"],
  "bank":             ["bank", "atm"],
  "office":           ["accounting", "insurance_agency", "lawyer", "real_estate_agency"],
  "industrial":       ["storage"],
  "mixed-use":        ["restaurant", "cafe", "supermarket", "bank", "gym", "doctor"],
  "convenience":      ["convenience_store", "gas_station", "atm"],
  "childcare":        ["school", "primary_school", "secondary_school"],
  "general commercial": ["supermarket", "restaurant", "bank", "gas_station", "shopping_mall", "hospital"],
};

interface MarketGapResult {
  corridor_coverage: Array<{
    location: string;
    lat: number;
    lng: number;
    businesses_found: number;
    categories: Record<string, number>;
    top_businesses: Array<{ name: string; type: string; distance_meters: number | null }>;
  }>;
  void_segments: Array<{
    location: string;
    missing_categories: string[];
    businesses_in_area: number;
    assessment: string;
  }>;
  market_density: {
    total_businesses: number;
    avg_per_point: number;
    densest_point: string;
    sparsest_point: string;
  };
}

async function scanMarketGaps(
  geoPoints: Array<{ loc: string; lat: number; lng: number }>,
  targetUse: string,
  gmapsKey: string,
): Promise<MarketGapResult> {
  const useKey = targetUse.toLowerCase().trim();
  const placeTypes = TARGET_USE_TO_PLACE_TYPES[useKey]
    || TARGET_USE_TO_PLACE_TYPES["general commercial"];

  const corridorCoverage: MarketGapResult["corridor_coverage"] = [];

  for (const point of geoPoints) {
    const places = await nearbyPlaces(point.lat, point.lng, gmapsKey, {
      radiusMeters: 3218, // 2 miles
      types: placeTypes,
    });

    const categories: Record<string, number> = {};
    for (const p of places) {
      categories[p.type] = (categories[p.type] || 0) + 1;
    }

    corridorCoverage.push({
      location: point.loc,
      lat: point.lat,
      lng: point.lng,
      businesses_found: places.length,
      categories,
      top_businesses: places.slice(0, 5).map((p) => ({
        name: p.name,
        type: p.type,
        distance_meters: p.distance_meters,
      })),
    });
  }

  // Identify void segments (locations where certain categories are missing)
  const voidSegments: MarketGapResult["void_segments"] = [];
  for (const point of corridorCoverage) {
    const missing = placeTypes.filter((t) => !point.categories[t] || point.categories[t] === 0);
    if (missing.length > 0) {
      const severity = missing.length / placeTypes.length;
      let assessment: string;
      if (severity > 0.7) {
        assessment = `Significant void: ${missing.length} of ${placeTypes.length} target categories absent. Strong development opportunity.`;
      } else if (severity > 0.4) {
        assessment = `Moderate void: ${missing.length} of ${placeTypes.length} target categories absent. Potential niche opportunity.`;
      } else {
        assessment = `Minor gap: ${missing.length} underrepresented category(s). Market is mostly served.`;
      }
      voidSegments.push({
        location: point.location,
        missing_categories: missing.map((t) => t.replace(/_/g, " ")),
        businesses_in_area: point.businesses_found,
        assessment,
      });
    }
  }

  const totals = corridorCoverage.map((c) => c.businesses_found);
  const total = totals.reduce((a, b) => a + b, 0);

  return {
    corridor_coverage: corridorCoverage,
    void_segments: voidSegments,
    market_density: {
      total_businesses: total,
      avg_per_point: Math.round(total / Math.max(corridorCoverage.length, 1)),
      densest_point: corridorCoverage.reduce((a, b) => a.businesses_found > b.businesses_found ? a : b).location,
      sparsest_point: corridorCoverage.reduce((a, b) => a.businesses_found < b.businesses_found ? a : b).location,
    },
  };
}

/** Resolve Google Maps API key from workspace integration or env */
async function resolveGmapsKey(workspaceId: string): Promise<string | null> {
  try {
    const { data: conn } = await supabaseAdmin
      .from("integration_connections")
      .select("credentials")
      .eq("workspace_id", workspaceId)
      .eq("provider", "google_maps")
      .eq("status", "connected")
      .maybeSingle();
    if (conn) {
      const creds = conn.credentials as Record<string, string>;
      if (creds.api_key) return creds.api_key;
    }
  } catch { /* fall through */ }
  return process.env.GOOGLE_MAPS_API_KEY || null;
}

export async function handleSiteScanVoidAnalysis(
  args: {
    locations: string[];
    target_use?: string;
    zoning?: string[];
    acreage_min?: number;
    acreage_max?: number;
    max_sites?: number;
    prefer_vacant?: boolean;
  },
  workspaceId: string,
): Promise<string> {
  const locations = args.locations;
  if (!locations || locations.length === 0) {
    return JSON.stringify({
      error:
        "Provide at least one location. For corridor analysis, provide 3-5 " +
        "points along the corridor (e.g. intersections, town centers, zip codes).",
    });
  }
  if (locations.length > 8) {
    return JSON.stringify({
      error: "Maximum 8 search points per void analysis.",
    });
  }

  const maxSites = Math.min(args.max_sites ?? 20, 30);
  const preferVacant = args.prefer_vacant !== false;
  const acMin = args.acreage_min ?? 0;
  const acMax = args.acreage_max ?? Infinity;

  // 1. Geocode locations sequentially with delay to respect
  //    Nominatim's 1 req/sec rate limit. Parallel geocoding
  //    risks 429 errors that kill the entire analysis.
  const geoResults: ({ loc: string; geo: NonNullable<Awaited<ReturnType<typeof geocodeAddress>>> } | null)[] = [];
  for (let gi = 0; gi < locations.length; gi++) {
    if (gi > 0) await new Promise((r) => setTimeout(r, 1100));
    const geo = await geocodeAddress(locations[gi]);
    geoResults.push(geo ? { loc: locations[gi], geo } : null);
  }
  const validGeos = geoResults.filter(
    (g): g is NonNullable<typeof g> => g !== null,
  );
  if (validGeos.length === 0) {
    return JSON.stringify({
      error:
        "Could not geocode any of the provided locations. " +
        "Try full addresses or city + state format.",
    });
  }

  // 2a. Kick off Google Maps market gap scan in parallel (if key available)
  const targetUse = args.target_use ?? "general commercial";
  const gmapsKeyPromise = resolveGmapsKey(workspaceId);
  const marketGapPromise: Promise<MarketGapResult | null> = gmapsKeyPromise.then(
    async (key) => {
      if (!key) return null;
      try {
        return await scanMarketGaps(
          validGeos.map((g) => ({ loc: g.loc, lat: g.geo.lat, lng: g.geo.lng })),
          targetUse,
          key,
        );
      } catch (err) {
        console.warn("[void_analysis] market gap scan failed:", err);
        return null;
      }
    },
  );

  // 2b. Search each geocoded point (10-mile radius, up to 40 results each)
  const allParcels: Array<{
    parcel_number: string;
    address: string;
    city?: string;
    centroid?: { lat: number; lng: number };
    zoning_class: string;
    zoning_description?: string;
    land_area_acres: number;
    assessed_value_total?: number;
    land_use_description?: string;
    county: string;
    state: string;
    source: string;
  }> = [];

  const searchedCounties = new Set<string>();
  const dataSourceIssues: Array<{
    county: string;
    state: string;
    status: "unavailable" | "error" | "no_coverage";
    detail: string;
  }> = [];

  for (const { geo } of validGeos) {
    let adapter;
    try {
      adapter = getAdapter(geo.state, geo.county);
    } catch {
      const countyKey = `${geo.state}:${geo.county}`;
      if (!searchedCounties.has(countyKey)) {
        searchedCounties.add(countyKey);
        dataSourceIssues.push({
          county: geo.county,
          state: geo.state,
          status: "no_coverage",
          detail: `No parcel data coverage for ${geo.county} County, ${geo.state} yet.`,
        });
      }
      continue;
    }
    const countyKey = `${geo.state}:${geo.county}`;
    if (searchedCounties.has(countyKey)) continue;
    searchedCounties.add(countyKey);

    const zoningConfig = adapter.config.zoningClassMap;
    let zoningCodes = args.zoning;
    if (zoningCodes && zoningConfig) {
      zoningCodes = zoningCodes.flatMap((z) => {
        const mapped = zoningConfig[z.toLowerCase()];
        return mapped ?? [z];
      });
    }

    // Resolve "prefer vacant" using the adapter's zoning map, not hardcoded codes.
    // We do a broader search and let the scoring layer boost vacant parcels.
    try {
      const parcels = await adapter.searchParcels({
        center: { lat: geo.lat, lng: geo.lng },
        radiusMeters: 16093, // 10 miles
        zoning: zoningCodes,
        acreageMin: args.acreage_min,
        acreageMax: args.acreage_max,
        maxResults: 40,
      });

      const sourceName =
        adapter.config.county === "*"
          ? `${geo.state} Statewide Parcel Database`
          : `${adapter.config.county} County Auditor`;

      for (const p of parcels) {
        allParcels.push({
          parcel_number: p.parcel_number,
          address: p.address,
          city: p.city,
          centroid: p.centroid,
          zoning_class: p.zoning_class,
          zoning_description: p.zoning_description,
          land_area_acres: p.land_area_acres,
          assessed_value_total: p.assessed_value_total,
          land_use_description: p.land_use_description,
          county: p.county ?? geo.county,
          state: p.state ?? geo.state,
          source: sourceName,
        });
      }
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        dataSourceIssues.push({
          county: geo.county,
          state: geo.state,
          status: "unavailable",
          detail: `${geo.county} County GIS is temporarily unreachable (circuit breaker open).`,
        });
      } else if (err instanceof ArcGISError) {
        dataSourceIssues.push({
          county: geo.county,
          state: geo.state,
          status: "error",
          detail: `${geo.county} County GIS returned an error (HTTP ${err.httpStatus ?? "unknown"}).`,
        });
      } else {
        dataSourceIssues.push({
          county: geo.county,
          state: geo.state,
          status: "error",
          detail: `Unexpected error querying ${geo.county} County: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  if (allParcels.length === 0) {
    return JSON.stringify({
      error:
        "No parcels found matching the criteria. Try broader zoning or acreage filters, " +
        "or different locations.",
      locations_searched: validGeos.map((g) => g.geo.matched_address),
    });
  }

  // 3. Deduplicate by parcel_number
  const seen = new Map<string, (typeof allParcels)[0]>();
  for (const p of allParcels) {
    const key = `${p.state}:${p.county}:${p.parcel_number}`;
    if (!seen.has(key)) seen.set(key, p);
  }
  const unique = Array.from(seen.values());

  // 4. Score each parcel
  const medianValue = (() => {
    const vals = unique
      .filter((p) => p.assessed_value_total && p.land_area_acres > 0)
      .map((p) => p.assessed_value_total! / p.land_area_acres)
      .sort((a, b) => a - b);
    return vals.length > 0 ? vals[Math.floor(vals.length / 2)] : 0;
  })();

  const scored = unique.map((p) => {
    let score = 0;

    // Acreage fit
    const ac = p.land_area_acres;
    if (ac >= acMin && ac <= acMax) {
      score += 3;
    } else if (
      ac >= acMin * 0.7 &&
      ac <= (acMax === Infinity ? Infinity : acMax * 1.3)
    ) {
      score += 1;
    }

    // Vacant land bonus
    const lu = (p.land_use_description ?? "").toLowerCase();
    if (
      lu.includes("vacant") ||
      lu.includes("undeveloped") ||
      lu.includes("agricultural")
    ) {
      score += 2;
    }

    // Value efficiency (below-median price per acre = cheaper to acquire)
    if (medianValue > 0 && p.assessed_value_total && p.land_area_acres > 0) {
      const perAcre = p.assessed_value_total / p.land_area_acres;
      if (perAcre < medianValue) score += 1;
    }

    // Has an address (better than just a parcel number)
    if (p.address && p.address.length > 5) score += 1;

    return { ...p, score };
  });

  // 5. Sort by score desc, then acreage desc (bigger sites first among ties)
  scored.sort((a, b) => b.score - a.score || b.land_area_acres - a.land_area_acres);

  // 6. Take top N
  const topSites = scored.slice(0, maxSites);

  // 7. Upsert top sites into DB
  for (const p of topSites) {
    try {
      await upsertParcel(workspaceId, {
        parcel_number: p.parcel_number,
        address: p.address,
        city: p.city,
        centroid: p.centroid,
        zoning_class: p.zoning_class,
        zoning_description: p.zoning_description,
        land_area_acres: p.land_area_acres,
        assessed_value_total: p.assessed_value_total,
        land_use_description: p.land_use_description,
        county: p.county,
        state: p.state,
      });
    } catch {
      // non-critical
    }
  }

  const accessedAt = new Date().toISOString();

  // Build citation markers for the model to use inline
  const citations = topSites.map((p, i) => {
    let sourceUrl = "";
    try {
      const a = getAdapter(p.state, p.county);
      sourceUrl = buildParcelSourceUrl(a.config, p.parcel_number);
    } catch { /* no coverage — leave blank */ }
    return {
      marker: `[ss:${i + 1}]`,
      index: i + 1,
      parcel_number: p.parcel_number,
      address: p.address || "No address on record",
      county: p.county,
      state: p.state,
      source: p.source,
      source_url: sourceUrl,
      accessed_at: accessedAt,
    };
  });

  // Build formatted citation block (same pattern as archive.search)
  const formatted = topSites
    .map(
      (p, i) =>
        `[ss:${i + 1}] (${p.source} · ${p.parcel_number})\n` +
        `Address: ${p.address || "No address on record"}\n` +
        `County: ${p.county}, ${p.state} | Zoning: ${p.zoning_class} | ` +
        `Acreage: ${Math.round(p.land_area_acres * 100) / 100} | ` +
        `Assessed: ${p.assessed_value_total != null ? "$" + p.assessed_value_total.toLocaleString() : "N/A"} | ` +
        `Land use: ${p.land_use_description ?? "N/A"}\n` +
        `Score: ${p.score}/5`,
    )
    .join("\n\n");

  // 8. Await Google Maps market gap results (was running in parallel)
  const marketGap = await marketGapPromise;

  return JSON.stringify({
    analysis_type: "directional_void_analysis",
    target_use: targetUse,
    search_points: validGeos.map((g) => g.geo.matched_address),
    total_parcels_scanned: allParcels.length,
    unique_after_dedup: unique.length,
    sites_returned: topSites.length,
    ...(dataSourceIssues.length > 0 && {
      data_source_issues: dataSourceIssues,
      data_source_note:
        `${dataSourceIssues.length} county source(s) had issues. ` +
        "Results may be incomplete for those areas. Mention affected counties when presenting findings.",
    }),
    ...(marketGap && {
      market_gap: {
        corridor_coverage: marketGap.corridor_coverage,
        void_segments: marketGap.void_segments,
        market_density: marketGap.market_density,
        note:
          "Market gap analysis powered by Google Maps Places API. " +
          "Void segments indicate locations where target-use categories have " +
          "low or zero existing competition within 2 miles.",
      },
    }),
    formatted,
    citations,
    sites: topSites.map((p, i) => ({
      rank: i + 1,
      citation: `[ss:${i + 1}]`,
      score: p.score,
      parcel_number: p.parcel_number,
      address: p.address || "No address on record",
      county: p.county,
      state: p.state,
      zoning: p.zoning_class,
      zoning_desc: p.zoning_description,
      acreage: Math.round(p.land_area_acres * 100) / 100,
      assessed_value: p.assessed_value_total ?? null,
      land_use: p.land_use_description ?? null,
      source: p.source,
    })),
    criteria: {
      zoning: args.zoning ?? "any",
      acreage_min: args.acreage_min ?? "none",
      acreage_max: args.acreage_max ?? "none",
      prefer_vacant: preferVacant,
    },
    accessed_at: accessedAt,
    caveat:
      "Directional analysis only. Assessed values and zoning from public county records " +
      "may not reflect recent changes. Verify each candidate site with the local " +
      "municipality and conduct proper due diligence before acquisition.",
    citation_instruction:
      "IMPORTANT: When presenting these results, cite each parcel using its [ss:N] " +
      "marker inline. For example: '5551 Humes Rd (48.21 ac, zoned C) [ss:1] has a ' " +
      "'notably low assessed value of $38,560.' Every data point from this tool result " +
      "must carry the parcel's [ss:N] citation.",
  });
}

// ---- site_scan.listings --------------------------------------

export async function handleSiteScanListings(
  args: {
    location: string;
    radius_miles?: number;
    property_type?: string;
    sf_min?: number;
    sf_max?: number;
  },
  _workspaceId: string,
): Promise<string> {
  // Crexi integration pending API key approval
  const geo = await geocodeAddress(args.location);
  if (!geo) {
    return JSON.stringify({ error: "Could not geocode location." });
  }

  return JSON.stringify({
    status: "listings_integration_pending",
    location_resolved: geo.matched_address,
    message:
      "Commercial listing search is being integrated. " +
      "In the meantime, check Crexi.com or LoopNet.com directly for " +
      `active listings near ${geo.matched_address}.`,
    search_links: {
      crexi: `https://www.crexi.com/properties?location=${encodeURIComponent(args.location)}`,
      loopnet: `https://www.loopnet.com/search/${encodeURIComponent(args.location)}`,
    },
  });
}

// ---- survey_area -----------------------------------------------
//
// Comprehensive business survey using Google Places API. Geocodes an
// address, sweeps all CRE-relevant business categories across caller-
// specified radii (default 1mi + 3mi), and returns structured per-
// business data organized by category. The model uses this to produce
// accurate void analysis grounded in real geospatial data.

const MILES_TO_METERS = 1609.34;

export async function handleSurveyArea(
  args: {
    address: string;
    radii_miles?: number[];
    categories?: string[];
  },
  workspaceId: string,
): Promise<string> {
  const address = (args.address || "").trim();
  if (!address) {
    return JSON.stringify({ error: "address is required" });
  }

  // Resolve API key
  const gmapsKey = await resolveGmapsKey(workspaceId);
  if (!gmapsKey) {
    return JSON.stringify({
      error:
        "Google Maps API key not configured. Connect Google Maps in " +
        "Settings > Integrations, or set GOOGLE_MAPS_API_KEY.",
    });
  }

  // Geocode
  const geo = await gmapsGeocode(address, gmapsKey);
  if (!geo) {
    // Fallback to Nominatim
    const nomGeo = await geocodeAddress(address);
    if (!nomGeo) {
      return JSON.stringify({
        error: "Could not geocode that address. Try a full street address with city and state.",
      });
    }
    // Use Nominatim coords
    return await runSurvey(nomGeo.lat, nomGeo.lng, nomGeo.matched_address, gmapsKey, args);
  }

  return await runSurvey(geo.latitude, geo.longitude, geo.formatted_address, gmapsKey, args);
}

async function runSurvey(
  lat: number,
  lng: number,
  resolvedAddress: string,
  gmapsKey: string,
  args: { radii_miles?: number[]; categories?: string[] },
): Promise<string> {
  // Validate and cap radii
  let radiiMiles = args.radii_miles?.length ? args.radii_miles : [1, 3];
  radiiMiles = radiiMiles
    .map((r) => Math.min(Math.max(r, 0.25), 5))
    .slice(0, 3)
    .sort((a, b) => a - b);
  const radiiMeters = radiiMiles.map((r) => Math.round(r * MILES_TO_METERS));

  let survey: SurveyResult;
  try {
    survey = await surveyNearbyBusinesses(lat, lng, gmapsKey, {
      radii: radiiMeters,
      categories: args.categories,
    });
  } catch (err) {
    return JSON.stringify({
      error: `Places API error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // If Google Places API returned errors (e.g. REQUEST_DENIED because
  // the Places API isn't enabled on the key), surface that immediately
  // instead of showing a misleading "0 businesses" void analysis.
  if (survey.api_errors?.length && survey.summary.total_unique === 0) {
    return JSON.stringify({
      error:
        "Google Places API returned errors for every category -- the results " +
        "would be empty and misleading. This usually means the Places API " +
        "(Nearby Search) is not enabled on your Google Cloud project, or the " +
        "API key has billing/quota issues. Check the Google Cloud Console.\n\n" +
        "Errors: " + survey.api_errors.slice(0, 5).join("; "),
      address_resolved: resolvedAddress,
      survey_center: { lat, lng },
    });
  }

  // Build formatted text block for quick model scanning
  const lines: string[] = [];
  lines.push(`AREA SURVEY: ${resolvedAddress}`);
  lines.push(`Center: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
  lines.push(`Radii: ${radiiMiles.map((r) => `${r} mi`).join(", ")}`);
  lines.push(`Total businesses found: ${survey.summary.total_unique}`);
  if (survey.api_errors?.length) {
    lines.push(`WARNING: ${survey.api_errors.length} API error(s) -- some categories may have incomplete data.`);
    for (const e of survey.api_errors.slice(0, 3)) {
      lines.push(`  * ${e}`);
    }
  }
  lines.push("");

  // Summary by radius
  for (const [band, count] of Object.entries(survey.summary.by_radius)) {
    lines.push(`  ${band.replace("_", " ")}: ${count} businesses`);
  }
  lines.push("");

  // Identify void indicators (categories with 0-2 businesses)
  const allCategories = [
    "restaurants", "grocery", "medical", "fitness", "retail",
    "financial", "education", "services", "entertainment", "lodging", "childcare",
  ];
  const filterCats = args.categories?.length
    ? args.categories.map((c) => c.toLowerCase())
    : null;
  const relevantCategories = filterCats
    ? allCategories.filter((c) => filterCats.includes(c))
    : allCategories;

  const voidIndicators: Array<{ category: string; count: number; level: string }> = [];
  for (const cat of relevantCategories) {
    const count = survey.summary.by_category[cat] || 0;
    if (count <= 2) {
      voidIndicators.push({
        category: cat,
        count,
        level: count === 0 ? "EMPTY" : "UNDERSERVED",
      });
    }
  }

  // Citation markers — assign [ss:N] to each surveyed business (same scheme
  // site_scan parcels use) so the model can cite each business inline. Without
  // these anchors the void analysis has real data but nothing to cite, so it
  // reads as uncited prose. Ordered to match the by_category output below.
  const surveyAccessedAt = new Date().toISOString();
  const bizMarker = new Map<string, string>();
  const citations: Array<Record<string, unknown>> = [];
  const markerKey = (b: SurveyBusiness) => b.place_id || `${b.name}|${b.address}`;
  for (const cat of relevantCategories) {
    const sorted = (survey.by_category[cat] || [])
      .slice()
      .sort((a, b) => a.distance_meters - b.distance_meters)
      .slice(0, 20);
    for (const b of sorted) {
      const key = markerKey(b);
      if (bizMarker.has(key)) continue;
      const idx = citations.length + 1;
      const marker = `[ss:${idx}]`;
      bizMarker.set(key, marker);
      const ratingStr = b.rating ? ` -- ${b.rating}/5 (${b.total_ratings} reviews)` : "";
      citations.push({
        marker,
        index: idx,
        address: `${b.name}, ${b.address} (${b.distance_miles} mi)${ratingStr}`,
        source: "Google Places API",
        source_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.name} ${b.address}`)}`,
        accessed_at: surveyAccessedAt,
      });
    }
  }
  const markerFor = (b: SurveyBusiness) => bizMarker.get(markerKey(b)) || "";

  // Category detail
  for (const cat of relevantCategories) {
    const businesses = survey.by_category[cat] || [];
    const voidTag = voidIndicators.find((v) => v.category === cat);
    const header = voidTag
      ? `[${voidTag.level}] ${cat.toUpperCase()} (${businesses.length})`
      : `${cat.toUpperCase()} (${businesses.length})`;
    lines.push(header);

    if (businesses.length === 0) {
      lines.push("  (none found)");
    } else {
      // Show up to 15 businesses per category, sorted by distance
      const shown = businesses
        .sort((a, b) => a.distance_meters - b.distance_meters)
        .slice(0, 15);
      for (const b of shown) {
        const rating = b.rating ? ` (${b.rating}/5, ${b.total_ratings} reviews)` : "";
        const mk = markerFor(b);
        lines.push(
          `  ${mk ? mk + " " : ""}${b.distance_miles} mi | ${b.name} | ${b.address}${rating} [${b.radius_band.replace("_", " ")}]`,
        );
      }
      if (businesses.length > 15) {
        lines.push(`  ... and ${businesses.length - 15} more`);
      }
    }
    lines.push("");
  }

  return JSON.stringify({
    address_resolved: resolvedAddress,
    survey_center: { lat, lng },
    radii_surveyed: radiiMiles.map((r) => `${r} mi`),
    summary: survey.summary,
    void_indicators: voidIndicators,
    by_category: Object.fromEntries(
      relevantCategories.map((cat) => [
        cat,
        (survey.by_category[cat] || [])
          .sort((a: SurveyBusiness, b: SurveyBusiness) => a.distance_meters - b.distance_meters)
          .slice(0, 20)
          .map((b: SurveyBusiness) => ({
            citation: markerFor(b),
            name: b.name,
            address: b.address,
            distance_miles: b.distance_miles,
            radius_band: b.radius_band,
            rating: b.rating,
            total_ratings: b.total_ratings,
            google_type: b.google_type,
          })),
      ]),
    ),
    citations,
    citation_instruction:
      "Every business you name in the analysis MUST carry its [ss:N] marker inline " +
      "(e.g. \"Domino's [ss:3] at 0.12 mi\"). These are live Google Places results — " +
      "cite them. Demographic, traffic (AADT), and rent figures are estimates, not from " +
      "this survey: label them as estimates and do not attach an [ss:N] marker to them.",
    formatted: lines.join("\n"),
    api_calls_made: survey.api_calls_made,
    ...(survey.api_errors?.length && { api_errors: survey.api_errors }),
    caveat:
      survey.api_errors?.length
        ? "WARNING: Some Google Places API calls failed. Business counts may be " +
          "incomplete -- categories showing 0 results may actually have businesses " +
          "nearby. Check that the Places API (Nearby Search) is enabled on the " +
          "Google Cloud project and that the API key has no billing issues."
        : "Point-in-time snapshot from Google Places API. Some businesses may be " +
          "missing or recently closed. Verify with on-site visit and local " +
          "business directories for critical decisions.",
  });
}

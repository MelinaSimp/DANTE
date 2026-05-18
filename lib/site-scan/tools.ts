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

  // Resolve natural-language zoning ("retail") to codes
  let zoningCodes = args.zoning;
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

  // 3. Query
  const parcels = await adapter.searchParcels({
    center: { lat: geo.lat, lng: geo.lng },
    radiusMeters: 8047, // 5 miles
    zoning: zoningCodes,
    acreageMin: args.acreage_min,
    acreageMax: args.acreage_max,
    landUse: landUseCodes,
    maxResults: args.max_results ?? 20,
  });

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
    } catch {
      return JSON.stringify({
        error: `No parcel data available for this location yet.`,
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
      sections.tax_estimate = estimateTax(auditor.data);
    } catch (err) {
      console.warn("[site_scan.detail] auditor fetch failed:", err);
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

  // 1. Geocode all locations in parallel
  const geoResults = await Promise.all(
    locations.map(async (loc) => {
      const geo = await geocodeAddress(loc);
      return geo ? { loc, geo } : null;
    }),
  );
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

  // 2. Search each geocoded point (10-mile radius, up to 40 results each)
  const allParcels: Array<{
    parcel_number: string;
    address: string;
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

  for (const { geo } of validGeos) {
    let adapter;
    try {
      adapter = getAdapter(geo.state, geo.county);
    } catch {
      continue; // no coverage for this county
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
          ? "Ohio OGRIP Statewide"
          : `${adapter.config.county} County Auditor`;

      for (const p of parcels) {
        allParcels.push({
          parcel_number: p.parcel_number,
          address: p.address,
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
      console.warn(
        `[void_analysis] search failed for ${countyKey}:`,
        err instanceof Error ? err.message : err,
      );
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
        zoning_class: p.zoning_class,
        zoning_description: p.zoning_description,
        land_area_acres: p.land_area_acres,
        assessed_value_total: p.assessed_value_total,
        land_use_description: p.land_use_description,
        county: p.county,
        state: p.state,
      } as any);
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

  return JSON.stringify({
    analysis_type: "directional_void_analysis",
    target_use: args.target_use ?? "general commercial",
    search_points: validGeos.map((g) => g.geo.matched_address),
    total_parcels_scanned: allParcels.length,
    unique_after_dedup: unique.length,
    sites_returned: topSites.length,
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

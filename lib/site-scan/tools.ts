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

  // Resolve land_use
  let landUseCodes: string[] | undefined;
  if (args.land_use === "vacant") {
    landUseCodes = ["400", "401", "402"];
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

  return JSON.stringify({
    location_resolved: geo.matched_address,
    county: geo.county,
    state: geo.state,
    results_count: parcels.length,
    detail_coverage: detailAvailable
      ? "Full parcel detail available for this county"
      : "Basic record only -- full detail not yet available for this county",
    parcels: parcels.map((p) => ({
      parcel_number: p.parcel_number,
      address: p.address,
      zoning: p.zoning_class,
      zoning_desc: p.zoning_description,
      acreage: Math.round(p.land_area_acres * 100) / 100,
      assessed_value: p.assessed_value_total,
      land_use: p.land_use_description,
    })),
    source:
      adapter.config.county === "*"
        ? "Ohio OGRIP Statewide"
        : `${adapter.config.county} County Auditor`,
    accessed_at: new Date().toISOString(),
    caveat:
      "Parcel data from public county records. Zoning, assessed values, and land use " +
      "may not reflect recent changes. Confirm with the local municipality before acting.",
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
            source_url: `${detailAdapter.config.serviceUrl} (parcel ${parcelNumber})`,
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

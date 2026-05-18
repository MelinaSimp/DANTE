// lib/site-scan/enrichment/geocoder.ts
//
// Two-tier geocoder:
//   1. Nominatim (OpenStreetMap) -- handles all input types: street
//      addresses, cities, zips, intersections, landmarks. Returns
//      county name + state abbreviation that the adapter registry
//      expects.
//   2. Census Bureau -- called only when census_tract is needed
//      (demographics enrichment in site_scan.detail). Street-address
//      only; returns FIPS codes.
//
// The original Census-only geocoder had two fatal bugs:
//   - Returned FIPS codes (e.g. "42") instead of state abbreviations
//     ("PA"), so the adapter registry NEVER matched.
//   - Only handled street addresses -- city/zip/intersection inputs
//     returned null, breaking void analysis completely.

export interface GeocodingResult {
  lat: number;
  lng: number;
  matched_address: string;
  county: string;        // County name (e.g. "Westmoreland"), NOT FIPS code
  state: string;         // Two-letter abbreviation (e.g. "PA"), NOT FIPS code
  census_tract: string;  // GEOID from Census Bureau; empty if not resolved
}

// ── Primary geocoder: Nominatim ──────────────────────────────────

export async function geocodeAddress(
  address: string,
): Promise<GeocodingResult | null> {
  // Try Nominatim first (handles all input types)
  const nominatim = await geocodeNominatim(address);
  if (nominatim) {
    // Optionally enrich with census_tract for demographics
    const tract = await getCensusTract(nominatim.lat, nominatim.lng);
    return { ...nominatim, census_tract: tract };
  }

  // Fallback: Census Bureau (street addresses only)
  return geocodeCensus(address);
}

async function geocodeNominatim(
  query: string,
): Promise<GeocodingResult | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "us");

  try {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "DriftCRM/1.0 (driftaillc@gmail.com)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const results = await res.json();
    const match = results?.[0];
    if (!match) return null;

    const addr = match.address || {};

    // Extract state abbreviation from ISO3166-2 code (e.g. "US-PA" → "PA")
    const iso = addr["ISO3166-2-lvl4"] || "";
    const stateAbbr = iso.startsWith("US-")
      ? iso.slice(3)
      : stateNameToAbbr(addr.state || "");

    // Extract county name, stripping " County" / " Parish" suffix
    const rawCounty = addr.county || "";
    const county = rawCounty
      .replace(/\s+(County|Parish|Borough|Census Area)$/i, "")
      .trim();

    if (!stateAbbr || !county) return null;

    return {
      lat: parseFloat(match.lat),
      lng: parseFloat(match.lon),
      matched_address: match.display_name || query,
      county,
      state: stateAbbr,
      census_tract: "", // filled by caller if needed
    };
  } catch (err) {
    console.warn("[geocoder/nominatim] failed:", err);
    return null;
  }
}

// ── Census Bureau: tract lookup by coordinates ───────────────────

async function getCensusTract(lat: number, lng: number): Promise<string> {
  const url = new URL(
    "https://geocoding.geo.census.gov/geocoder/geographies/coordinates",
  );
  url.searchParams.set("x", lng.toString());
  url.searchParams.set("y", lat.toString());
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("vintage", "Current_Current");
  url.searchParams.set("format", "json");

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return "";
    const json = await res.json();
    const geo = json.result?.geographies?.["Census Tracts"]?.[0];
    return geo?.GEOID ?? "";
  } catch {
    return "";
  }
}

// ── Fallback: Census Bureau address geocoder ─────────────────────
// Only handles street addresses. Returns null for cities, zips, etc.

async function geocodeCensus(
  address: string,
): Promise<GeocodingResult | null> {
  const url = new URL(
    "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress",
  );
  url.searchParams.set("address", address);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("vintage", "Current_Current");
  url.searchParams.set("format", "json");

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const match = json.result?.addressMatches?.[0];
    if (!match) return null;

    const geo = match.geographies?.["Census Tracts"]?.[0];
    const stateFips = geo?.STATE ?? "";
    const countyFips = geo?.COUNTY ?? "";

    // Map FIPS codes to names/abbreviations
    const stateAbbr = FIPS_TO_STATE[stateFips] ?? "";
    const countyName = (geo?.BASENAME ?? "").trim() || `FIPS ${countyFips}`;

    if (!stateAbbr) return null;

    return {
      lat: match.coordinates.y,
      lng: match.coordinates.x,
      matched_address: match.matchedAddress,
      county: countyName,
      state: stateAbbr,
      census_tract: geo?.GEOID ?? "",
    };
  } catch (err) {
    console.warn("[geocoder/census] failed:", err);
    return null;
  }
}

// ── Lookup tables ────────────────────────────────────────────────

const STATE_NAMES: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR",
  California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE",
  Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
  Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS",
  Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
  "New York": "NY", "North Carolina": "NC", "North Dakota": "ND",
  Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA",
  "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
  Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV",
  Wisconsin: "WI", Wyoming: "WY", "District of Columbia": "DC",
};

function stateNameToAbbr(name: string): string {
  return STATE_NAMES[name] || "";
}

const FIPS_TO_STATE: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA",
  "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL",
  "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN",
  "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME",
  "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS",
  "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
  "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
  "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
  "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
  "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI",
  "56": "WY",
};

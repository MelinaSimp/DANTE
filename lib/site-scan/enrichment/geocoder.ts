// lib/site-scan/enrichment/geocoder.ts
// Census Bureau Geocoder — free, no key, national coverage.

export interface GeocodingResult {
  lat: number;
  lng: number;
  matched_address: string;
  county: string;
  state: string;
  census_tract: string;
}

export async function geocodeAddress(
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
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const json = await res.json();
    const match = json.result?.addressMatches?.[0];
    if (!match) return null;

    const geo = match.geographies?.["Census Tracts"]?.[0];
    return {
      lat: match.coordinates.y,
      lng: match.coordinates.x,
      matched_address: match.matchedAddress,
      county: geo?.COUNTY ?? "",
      state: geo?.STATE ?? "",
      census_tract: geo?.GEOID ?? "",
    };
  } catch (err) {
    console.warn("[geocoder] failed:", err);
    return null;
  }
}

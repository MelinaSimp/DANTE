// lib/data-sources/google-maps.ts
//
// Google Maps Platform data source for the due diligence pipeline.
// Uses Geocoding, Places Nearby, and Distance Matrix APIs.
//
// All functions require a Google Maps API key — pass it explicitly.
// The caller (workflow-runner) pulls the key from either:
//   1. integration_connections (workspace-level, stored via Settings)
//   2. GOOGLE_MAPS_API_KEY env var (platform-level fallback)
//
// Pricing reference (per 1,000 requests):
//   Geocoding: $5     | Places Nearby: $32
//   Distance Matrix: $10  | Reverse Geocoding: $5

const GEO_BASE = "https://maps.googleapis.com/maps/api/geocode/json";
const PLACES_BASE = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";
const DISTANCE_BASE = "https://maps.googleapis.com/maps/api/distancematrix/json";

// ── Types ────────────────────────────────────────────────────

export interface GeocodedLocation {
  formatted_address: string;
  latitude: number;
  longitude: number;
  place_id: string;
  address_components: {
    county: string | null;
    state: string | null;
    state_fips: string | null;
    zip: string | null;
    city: string | null;
  };
}

export interface NearbyPlace {
  name: string;
  type: string;
  vicinity: string;
  distance_meters: number | null;
  rating: number | null;
  total_ratings: number;
  open_now: boolean | null;
}

export interface DistanceResult {
  destination: string;
  distance_text: string;
  distance_meters: number;
  duration_text: string;
  duration_seconds: number;
}

// ── State FIPS lookup (for auto-resolving from geocode results) ──

export const STATE_ABBR_TO_FIPS: Record<string, string> = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06",
  CO: "08", CT: "09", DE: "10", DC: "11", FL: "12",
  GA: "13", HI: "15", ID: "16", IL: "17", IN: "18",
  IA: "19", KS: "20", KY: "21", LA: "22", ME: "23",
  MD: "24", MA: "25", MI: "26", MN: "27", MS: "28",
  MO: "29", MT: "30", NE: "31", NV: "32", NH: "33",
  NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38",
  OH: "39", OK: "40", OR: "41", PA: "42", RI: "44",
  SC: "45", SD: "46", TN: "47", TX: "48", UT: "49",
  VT: "50", VA: "51", WA: "53", WV: "54", WI: "55",
  WY: "56",
};

// ── Geocode ──────────────────────────────────────────────────

export async function geocodeAddress(
  address: string,
  apiKey: string,
): Promise<GeocodedLocation | null> {
  const url = `${GEO_BASE}?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  if (data.status !== "OK" || !data.results?.length) return null;

  const result = data.results[0];
  const loc = result.geometry.location;
  const components = result.address_components || [];

  const find = (type: string): string | null => {
    const c = components.find((c: { types: string[] }) => c.types.includes(type));
    return c?.short_name || c?.long_name || null;
  };

  const stateAbbr = find("administrative_area_level_1");

  return {
    formatted_address: result.formatted_address,
    latitude: loc.lat,
    longitude: loc.lng,
    place_id: result.place_id,
    address_components: {
      county: find("administrative_area_level_2")?.replace(/ County$/i, "") || null,
      state: stateAbbr,
      state_fips: stateAbbr ? STATE_ABBR_TO_FIPS[stateAbbr] || null : null,
      zip: find("postal_code"),
      city: find("locality") || find("sublocality"),
    },
  };
}

// ── Reverse geocode ──────────────────────────────────────────

export async function reverseGeocode(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<GeocodedLocation | null> {
  const url = `${GEO_BASE}?latlng=${lat},${lng}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  if (data.status !== "OK" || !data.results?.length) return null;

  const result = data.results[0];
  const loc = result.geometry.location;
  const components = result.address_components || [];

  const find = (type: string): string | null => {
    const c = components.find((c: { types: string[] }) => c.types.includes(type));
    return c?.short_name || c?.long_name || null;
  };

  const stateAbbr = find("administrative_area_level_1");

  return {
    formatted_address: result.formatted_address,
    latitude: loc.lat,
    longitude: loc.lng,
    place_id: result.place_id,
    address_components: {
      county: find("administrative_area_level_2")?.replace(/ County$/i, "") || null,
      state: stateAbbr,
      state_fips: stateAbbr ? STATE_ABBR_TO_FIPS[stateAbbr] || null : null,
      zip: find("postal_code"),
      city: find("locality") || find("sublocality"),
    },
  };
}

// ── Nearby places ────────────────────────────────────────────
//
// CRE-relevant place types for site analysis. Groups:
//   transit:  transit_station, bus_station, subway_station
//   retail:   shopping_mall, supermarket, restaurant
//   services: hospital, school, bank, post_office
//   risk:     gas_station (UST risk indicator)

const CRE_PLACE_TYPES = [
  "transit_station",
  "hospital",
  "school",
  "shopping_mall",
  "supermarket",
  "restaurant",
  "bank",
  "gas_station",
] as const;

export async function nearbyPlaces(
  lat: number,
  lng: number,
  apiKey: string,
  opts?: { radiusMeters?: number; types?: string[] },
): Promise<NearbyPlace[]> {
  const radius = opts?.radiusMeters ?? 1609; // 1 mile default
  const types = opts?.types ?? [...CRE_PLACE_TYPES];
  const allResults: NearbyPlace[] = [];

  // Query each type separately (Places API only supports one type per call)
  // Limit to 3 types at a time to avoid rate limits
  const typeChunks = types.slice(0, 6);

  const fetches = typeChunks.map(async (type) => {
    const url = `${PLACES_BASE}?location=${lat},${lng}&radius=${radius}&type=${type}&key=${apiKey}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      if (data.status !== "OK") return [];

      return (data.results || []).slice(0, 5).map((p: Record<string, unknown>) => ({
        name: String(p.name || ""),
        type,
        vicinity: String(p.vicinity || ""),
        distance_meters: p.geometry
          ? haversineMeters(lat, lng, (p.geometry as { location: { lat: number; lng: number } }).location.lat, (p.geometry as { location: { lat: number; lng: number } }).location.lng)
          : null,
        rating: typeof p.rating === "number" ? p.rating : null,
        total_ratings: typeof p.user_ratings_total === "number" ? p.user_ratings_total : 0,
        open_now: (p.opening_hours as { open_now?: boolean } | undefined)?.open_now ?? null,
      }));
    } catch {
      return [];
    }
  });

  const results = await Promise.all(fetches);
  for (const batch of results) allResults.push(...batch);

  return allResults.sort((a, b) => (a.distance_meters ?? Infinity) - (b.distance_meters ?? Infinity));
}

// ── Distance matrix ──────────────────────────────────────────

export async function distanceMatrix(
  originLat: number,
  originLng: number,
  destinations: string[],
  apiKey: string,
): Promise<DistanceResult[]> {
  if (destinations.length === 0) return [];

  const origin = `${originLat},${originLng}`;
  const dests = destinations.slice(0, 10).join("|"); // max 10 destinations
  const url = `${DISTANCE_BASE}?origins=${origin}&destinations=${encodeURIComponent(dests)}&key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();
  if (data.status !== "OK") return [];

  const row = data.rows?.[0];
  if (!row) return [];

  return row.elements.map((el: Record<string, unknown>, i: number) => {
    if ((el as { status: string }).status !== "OK") {
      return {
        destination: destinations[i],
        distance_text: "N/A",
        distance_meters: 0,
        duration_text: "N/A",
        duration_seconds: 0,
      };
    }
    return {
      destination: destinations[i],
      distance_text: (el.distance as { text: string })?.text || "",
      distance_meters: (el.distance as { value: number })?.value || 0,
      duration_text: (el.duration as { text: string })?.text || "",
      duration_seconds: (el.duration as { value: number })?.value || 0,
    };
  });
}

// ── Haversine (meters) ───────────────────────────────────────

function haversineMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

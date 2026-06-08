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

// ── Area survey (comprehensive business scan) ───────────────
//
// Sweeps Google Places API across CRE-relevant business categories
// at caller-specified radii. Returns every business found, organized
// by category, with distance, rating, and radius-band tagging.
// Used by the survey_area agent tool for void analysis grounding.

export interface SurveyBusiness {
  name: string;
  place_id: string;
  category: string;
  google_type: string;
  address: string;
  distance_meters: number;
  distance_miles: number;
  radius_band: string;
  rating: number | null;
  total_ratings: number;
  open_now: boolean | null;
  price_level: number | null;
}

export interface SurveyResult {
  businesses: SurveyBusiness[];
  by_category: Record<string, SurveyBusiness[]>;
  summary: {
    total_unique: number;
    by_radius: Record<string, number>;
    by_category: Record<string, number>;
  };
  api_calls_made: number;
  /** Non-OK statuses returned by Google Places API (e.g. REQUEST_DENIED).
   *  If this is non-empty, the results are incomplete or empty. */
  api_errors?: string[];
}

/** CRE void-analysis taxonomy: category name -> Google place types */
const SURVEY_CATEGORIES: Record<string, string[]> = {
  restaurants:    ["restaurant", "cafe", "bar", "bakery", "meal_delivery"],
  grocery:        ["supermarket", "grocery_or_supermarket", "convenience_store"],
  medical:        ["hospital", "doctor", "dentist", "pharmacy", "physiotherapist", "veterinary_care"],
  fitness:        ["gym", "spa"],
  retail:         ["shopping_mall", "clothing_store", "shoe_store", "furniture_store", "electronics_store", "book_store", "home_goods_store", "pet_store", "hardware_store"],
  financial:      ["bank", "accounting", "insurance_agency"],
  education:      ["school", "primary_school", "secondary_school", "university"],
  services:       ["laundry", "hair_care", "beauty_salon", "car_wash", "car_repair", "gas_station", "post_office"],
  entertainment:  ["movie_theater", "bowling_alley", "night_club"],
  lodging:        ["lodging"],
  childcare:      ["school", "primary_school"],
};

/** Simple in-memory cache for Places results. Key = lat,lng,radius,type */
const placesCache = new Map<string, { data: unknown[]; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCachedPlaces(key: string): unknown[] | null {
  const entry = placesCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    placesCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedPlaces(key: string, data: unknown[]) {
  // Evict oldest entries if cache gets too large
  if (placesCache.size > 500) {
    const oldest = placesCache.keys().next().value;
    if (oldest) placesCache.delete(oldest);
  }
  placesCache.set(key, { data, ts: Date.now() });
}

/**
 * Label a distance in meters with its radius band name.
 * Radii are sorted ascending; the band is the smallest radius that contains the point.
 */
function radiusBandLabel(distMeters: number, radiiMeters: number[]): string {
  for (const r of radiiMeters) {
    if (distMeters <= r) {
      const miles = Math.round(r / 1609.34);
      return `${miles}_mile`;
    }
  }
  const miles = Math.round(radiiMeters[radiiMeters.length - 1] / 1609.34);
  return `${miles}_mile`;
}

export async function surveyNearbyBusinesses(
  lat: number,
  lng: number,
  apiKey: string,
  opts: {
    radii: number[];
    categories?: string[];
    maxPerType?: number;
  },
): Promise<SurveyResult> {
  const radii = [...opts.radii].sort((a, b) => a - b);
  const outerRadius = radii[radii.length - 1];
  const maxPerType = opts.maxPerType ?? 60; // up to 3 pages
  const filterCategories = opts.categories?.length
    ? opts.categories.map((c) => c.toLowerCase())
    : null;

  // Build the list of (category, googleType) pairs to query
  const queries: Array<{ category: string; googleType: string }> = [];
  for (const [cat, types] of Object.entries(SURVEY_CATEGORIES)) {
    if (filterCategories && !filterCategories.includes(cat)) continue;
    for (const t of types) {
      queries.push({ category: cat, googleType: t });
    }
  }

  // Deduplicate by place_id
  const seen = new Map<string, SurveyBusiness>();
  let apiCalls = 0;
  const apiErrors = new Set<string>();

  // Batch queries: 8 concurrent requests to stay under 50 QPS
  const BATCH_SIZE = 8;
  for (let i = 0; i < queries.length; i += BATCH_SIZE) {
    const batch = queries.slice(i, i + BATCH_SIZE);
    const fetches = batch.map(async ({ category, googleType }) => {
      const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)},${outerRadius},${googleType}`;
      const cached = getCachedPlaces(cacheKey);
      if (cached) return { category, googleType, results: cached };

      const results: unknown[] = [];
      let nextPageToken: string | null = null;
      let pages = 0;

      while (pages < 3) { // max 3 pages = 60 results per type
        const params = new URLSearchParams({
          location: `${lat},${lng}`,
          radius: String(outerRadius),
          type: googleType,
          key: apiKey,
        });
        if (nextPageToken) params.set("pagetoken", nextPageToken);

        try {
          const res = await fetch(`${PLACES_BASE}?${params}`);
          apiCalls++;
          if (!res.ok) {
            apiErrors.add(`HTTP ${res.status} for type=${googleType}`);
            break;
          }
          const data = await res.json();
          if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
            apiErrors.add(`${data.status}: ${data.error_message || "unknown error"} (type=${googleType})`);
            break;
          }
          results.push(...(data.results || []));
          nextPageToken = data.next_page_token || null;
          pages++;
          if (!nextPageToken || results.length >= maxPerType) break;
          // Google requires a short delay before using next_page_token
          await new Promise((r) => setTimeout(r, 250));
        } catch (err) {
          apiErrors.add(`fetch error for type=${googleType}: ${err instanceof Error ? err.message : String(err)}`);
          break;
        }
      }

      setCachedPlaces(cacheKey, results);
      return { category, googleType, results };
    });

    const batchResults = await Promise.all(fetches);

    for (const { category, googleType, results } of batchResults) {
      for (const p of results as Array<Record<string, unknown>>) {
        const placeId = String(p.place_id || "");
        if (!placeId || seen.has(placeId)) continue;

        const geo = p.geometry as
          | { location: { lat: number; lng: number } }
          | undefined;
        if (!geo) continue;

        const dist = haversineMeters(lat, lng, geo.location.lat, geo.location.lng);
        if (dist > outerRadius) continue;

        seen.set(placeId, {
          name: String(p.name || ""),
          place_id: placeId,
          category,
          google_type: googleType,
          address: String(p.vicinity || ""),
          distance_meters: Math.round(dist),
          distance_miles: Math.round((dist / 1609.34) * 100) / 100,
          radius_band: radiusBandLabel(dist, radii),
          rating: typeof p.rating === "number" ? p.rating : null,
          total_ratings: typeof p.user_ratings_total === "number" ? p.user_ratings_total : 0,
          open_now: (p.opening_hours as { open_now?: boolean } | undefined)?.open_now ?? null,
          price_level: typeof p.price_level === "number" ? p.price_level : null,
        });
      }
    }

    // Small delay between batches to be polite to the API
    if (i + BATCH_SIZE < queries.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  // Organize results
  const businesses = Array.from(seen.values()).sort(
    (a, b) => a.distance_meters - b.distance_meters,
  );

  const byCategory: Record<string, SurveyBusiness[]> = {};
  const byRadius: Record<string, number> = {};
  const byCategoryCounts: Record<string, number> = {};

  for (const b of businesses) {
    (byCategory[b.category] ??= []).push(b);
    byRadius[b.radius_band] = (byRadius[b.radius_band] || 0) + 1;
    byCategoryCounts[b.category] = (byCategoryCounts[b.category] || 0) + 1;
  }

  return {
    businesses,
    by_category: byCategory,
    summary: {
      total_unique: businesses.length,
      by_radius: byRadius,
      by_category: byCategoryCounts,
    },
    api_calls_made: apiCalls,
    ...(apiErrors.size > 0 && { api_errors: Array.from(apiErrors) }),
  };
}

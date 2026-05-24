const BASE = "https://data.epa.gov/efservice";

export interface EpaFacility {
  registry_id: string;
  facility_name: string;
  city: string;
  state: string;
  zip: string;
  latitude: number;
  longitude: number;
  distance_miles: number;
}

export interface EpaBrownfield {
  handler_id: string;
  site_name: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
}

export async function queryToxicsFacilities(
  lat: number,
  lng: number,
  radiusMiles = 1,
  opts?: { stateFips?: string; countyName?: string },
): Promise<EpaFacility[]> {
  const stateAbbr = opts?.stateFips ? FIPS_TO_STATE[opts.stateFips] : null;
  if (!stateAbbr) return [];

  let url = `${BASE}/TRI_FACILITY/STATE_ABBR/${stateAbbr}`;
  if (opts?.countyName) {
    url += `/COUNTY_NAME/${encodeURIComponent(opts.countyName.toUpperCase())}`;
  }
  url += `/JSON`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("json")) return [];

  const data: Record<string, unknown>[] = await res.json();
  if (!Array.isArray(data)) return [];

  return data
    .map((f) => {
      const fLat = Number(f.pref_latitude || 0);
      let fLng = Number(f.pref_longitude || 0);
      if (!fLat || !fLng) return null;
      if (fLng > 0 && lng < 0) fLng = -fLng;
      const dist = haversine(lat, lng, fLat, fLng);
      if (dist > radiusMiles) return null;
      return {
        registry_id: String(f.tri_facility_id || ""),
        facility_name: String(f.facility_name || ""),
        city: String(f.city_name || ""),
        state: String(f.state_abbr || ""),
        zip: String(f.zip_code || ""),
        latitude: fLat,
        longitude: fLng,
        distance_miles: Math.round(dist * 100) / 100,
      };
    })
    .filter((f): f is EpaFacility => f !== null)
    .sort((a, b) => a.distance_miles - b.distance_miles);
}

export async function querySuperfundSites(
  stateInput: string,
): Promise<EpaBrownfield[]> {
  const stateAbbr = FIPS_TO_STATE[stateInput] || stateInput;
  const url = `${BASE}/SEMS_ACTIVE_SITES/STATE_CODE/${stateAbbr}/JSON`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("json")) return [];

  const data: Record<string, unknown>[] = await res.json();
  if (!Array.isArray(data)) return [];

  return data
    .filter((s) => s.LATITUDE || s.latitude)
    .map((s) => ({
      handler_id: String(s.SITE_EPA_ID || s.site_epa_id || ""),
      site_name: String(s.SITE_NAME || s.site_name || ""),
      city: String(s.CITY_NAME || s.city_name || ""),
      state: String(s.STATE_CODE || s.state_code || ""),
      latitude: Number(s.LATITUDE || s.latitude),
      longitude: Number(s.LONGITUDE || s.longitude),
    }));
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

function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
): Promise<EpaFacility[]> {
  const url =
    `${BASE}/TRI_FACILITY/LATITUDE/>${lat - radiusMiles * 0.0145}/LATITUDE/<${lat + radiusMiles * 0.0145}/LONGITUDE/>${lng - radiusMiles * 0.0183}/LONGITUDE/<${lng + radiusMiles * 0.0183}/JSON`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data: any[] = await res.json();

  return data.map((f) => {
    const fLat = Number(f.LATITUDE);
    const fLng = Number(f.LONGITUDE);
    return {
      registry_id: f.TRI_FACILITY_ID || "",
      facility_name: f.FACILITY_NAME || "",
      city: f.CITY_NAME || "",
      state: f.STATE_ABBR || "",
      zip: f.ZIP_CODE || "",
      latitude: fLat,
      longitude: fLng,
      distance_miles: haversine(lat, lng, fLat, fLng),
    };
  });
}

export async function querySuperfundSites(
  state: string,
): Promise<EpaBrownfield[]> {
  const url = `${BASE}/SEMS_ACTIVE_SITES/STATE_CODE/${state}/JSON`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data: any[] = await res.json();

  return data
    .filter((s) => s.LATITUDE && s.LONGITUDE)
    .map((s) => ({
      handler_id: s.SITE_EPA_ID || "",
      site_name: s.SITE_NAME || "",
      city: s.CITY_NAME || "",
      state: s.STATE_CODE || "",
      latitude: Number(s.LATITUDE),
      longitude: Number(s.LONGITUDE),
    }));
}

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

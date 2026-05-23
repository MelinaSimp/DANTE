const BASE =
  "https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query";

export interface FloodZoneResult {
  flood_zone: string;
  flood_zone_subtype: string | null;
  fld_zone: string;
  zone_description: string;
  sfha: boolean;
}

const ZONE_DESCRIPTIONS: Record<string, string> = {
  A: "100-year floodplain, no BFE determined",
  AE: "100-year floodplain, BFE determined",
  AH: "100-year shallow flooding, 1-3 ft",
  AO: "100-year sheet flow, 1-3 ft",
  V: "Coastal 100-year flood with velocity",
  VE: "Coastal 100-year flood with velocity, BFE determined",
  X: "Outside 500-year floodplain (minimal risk)",
  D: "Undetermined flood hazard",
};

function isSpecialFloodHazardArea(zone: string): boolean {
  return /^[AV]/.test(zone);
}

export async function queryFloodZone(
  lat: number,
  lng: number,
): Promise<FloodZoneResult | null> {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "FLD_ZONE,ZONE_SUBTY",
    returnGeometry: "false",
    f: "json",
  });

  const res = await fetch(`${BASE}?${params}`);
  if (!res.ok) return null;

  const data = await res.json();
  const feature = data.features?.[0];
  if (!feature) return null;

  const zone = feature.attributes.FLD_ZONE || "X";
  const subtype = feature.attributes.ZONE_SUBTY || null;

  return {
    flood_zone: zone,
    flood_zone_subtype: subtype,
    fld_zone: zone,
    zone_description: ZONE_DESCRIPTIONS[zone] || `Zone ${zone}`,
    sfha: isSpecialFloodHazardArea(zone),
  };
}

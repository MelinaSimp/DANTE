// lib/site-scan/adapters/registry.ts
// Adapter resolution — given a state and optional county,
// pick the most specific adapter available.

import { ArcGISCountyAdapter } from "./arcgis";
import { OGRIP_OH } from "./configs/ogrip-oh";
import { CUYAHOGA_OH } from "./configs/cuyahoga-oh";
import { ALLEGHENY_PA } from "./configs/allegheny-pa";
import { WESTMORELAND_PA } from "./configs/westmoreland-pa";
import { BUTLER_PA } from "./configs/butler-pa";
import { BEAVER_PA } from "./configs/beaver-pa";
import type { CountyAdapter, CountyAdapterConfig } from "./types";

const COUNTY_CONFIGS: CountyAdapterConfig[] = [
  CUYAHOGA_OH,
  ALLEGHENY_PA,
  WESTMORELAND_PA,
  BUTLER_PA,
  BEAVER_PA,
];

const STATEWIDE_CONFIGS: Record<string, CountyAdapterConfig> = {
  OH: OGRIP_OH,
  // PA has no statewide parcel service with attributes
};

export function getAdapter(state: string, county?: string): CountyAdapter {
  // Prefer county-specific adapter for richer detail
  if (county) {
    const config = COUNTY_CONFIGS.find(
      (c) =>
        c.state === state &&
        c.county.toLowerCase() === county.toLowerCase(),
    );
    if (config) return new ArcGISCountyAdapter(config);
  }
  // Fall back to statewide
  const stateConfig = STATEWIDE_CONFIGS[state];
  if (stateConfig) return new ArcGISCountyAdapter(stateConfig);

  throw new Error(
    `No parcel data adapter available for ${county ?? ""}, ${state}`,
  );
}

export function getDetailAdapter(
  state: string,
  county: string,
): CountyAdapter | null {
  const config = COUNTY_CONFIGS.find(
    (c) =>
      c.state === state &&
      c.county.toLowerCase() === county.toLowerCase(),
  );
  return config ? new ArcGISCountyAdapter(config) : null;
}

export function hasDetailCoverage(state: string, county: string): boolean {
  return COUNTY_CONFIGS.some(
    (c) =>
      c.state === state &&
      c.county.toLowerCase() === county.toLowerCase(),
  );
}

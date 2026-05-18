// lib/site-scan/adapters/registry.ts
// Adapter resolution — given a state and optional county,
// pick the most specific adapter available.
//
// Coverage (as of 2026-05):
//   Statewide: OH, CO, WI, MT, NY, AR               (6 states)
//   County:    Cuyahoga OH, Allegheny PA, Westmoreland PA,
//              Butler PA, Beaver PA                   (5 counties)
//
// Each config has been verified with live spatial envelope queries.
// States not listed return a clear error with the covered list.

import { ArcGISCountyAdapter } from "./arcgis";
import { OGRIP_OH } from "./configs/ogrip-oh";
import { CUYAHOGA_OH } from "./configs/cuyahoga-oh";
import { ALLEGHENY_PA } from "./configs/allegheny-pa";
import { WESTMORELAND_PA } from "./configs/westmoreland-pa";
import { BUTLER_PA } from "./configs/butler-pa";
import { BEAVER_PA } from "./configs/beaver-pa";
import { STATEWIDE_CO } from "./configs/colorado";
import { STATEWIDE_WI } from "./configs/wisconsin";
import { STATEWIDE_MT } from "./configs/montana";
import { STATEWIDE_NY } from "./configs/new-york";
import { STATEWIDE_AR } from "./configs/arkansas";
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
  CO: STATEWIDE_CO,
  WI: STATEWIDE_WI,
  MT: STATEWIDE_MT,
  NY: STATEWIDE_NY,
  AR: STATEWIDE_AR,
};

/** All states with at least statewide or county-level coverage. */
export const COVERED_STATES = new Set([
  ...Object.keys(STATEWIDE_CONFIGS),
  ...COUNTY_CONFIGS.map((c) => c.state),
]);

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
    `No parcel data adapter available for ${county ?? ""}, ${state}. ` +
    `Currently covered: ${Array.from(COVERED_STATES).sort().join(", ")}.`,
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

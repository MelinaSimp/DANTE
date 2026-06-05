// lib/site-scan/adapters/registry.ts
// Adapter resolution — given a state and optional county,
// pick the most specific adapter available.
//
// Coverage (as of 2026-06):
//   Statewide: AK, AL, AR, AZ, CA, CO, CT, DE, FL,  (50 states)
//              GA, HI, IA, ID, IL, IN, KS, KY, LA,
//              MA, MD, ME, MI, MN, MO, MS, MT, NC,
//              ND, NE, NH, NJ, NM, NV, NY, OH, OK,
//              OR, PA, RI, SC, SD, TN, TX, UT, VA,
//              VT, WA, WI, WV, WY
//   County:    Cuyahoga OH, Allegheny PA, Westmoreland PA,
//              Butler PA, Beaver PA, El Paso CO       (6 counties)
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
import { STATEWIDE_TX } from "./configs/texas";
import { STATEWIDE_FL } from "./configs/florida";
import { STATEWIDE_GA } from "./configs/georgia";
import { STATEWIDE_NC } from "./configs/north-carolina";
import { STATEWIDE_VA } from "./configs/virginia";
import { STATEWIDE_TN } from "./configs/tennessee";
import { STATEWIDE_AZ } from "./configs/arizona";
import { STATEWIDE_IL } from "./configs/illinois";
import { STATEWIDE_CA } from "./configs/california";
import { STATEWIDE_NJ } from "./configs/new-jersey";
import { STATEWIDE_MA } from "./configs/massachusetts";
import { STATEWIDE_MD } from "./configs/maryland";
import { STATEWIDE_WA } from "./configs/washington";
import { STATEWIDE_OR } from "./configs/oregon";
import { STATEWIDE_MN } from "./configs/minnesota";
import { STATEWIDE_MO } from "./configs/missouri";
import { STATEWIDE_IN } from "./configs/indiana";
import { STATEWIDE_MI } from "./configs/michigan";
import { STATEWIDE_SC } from "./configs/south-carolina";
import { STATEWIDE_LA } from "./configs/louisiana";
import { STATEWIDE_NV } from "./configs/nevada";
import { STATEWIDE_CT } from "./configs/connecticut";
import { STATEWIDE_UT } from "./configs/utah";
import { STATEWIDE_KY } from "./configs/kentucky";
import { STATEWIDE_PA } from "./configs/pennsylvania";
import { STATEWIDE_NH } from "./configs/new-hampshire";
import { STATEWIDE_IA } from "./configs/iowa";
import { STATEWIDE_KS } from "./configs/kansas";
import { STATEWIDE_NE } from "./configs/nebraska";
import { STATEWIDE_OK } from "./configs/oklahoma";
import { STATEWIDE_AL } from "./configs/alabama";
import { STATEWIDE_MS } from "./configs/mississippi";
import { STATEWIDE_NM } from "./configs/new-mexico";
import { STATEWIDE_ID } from "./configs/idaho";
import { STATEWIDE_VT } from "./configs/vermont";
import { STATEWIDE_WY } from "./configs/wyoming";
import { STATEWIDE_WV } from "./configs/west-virginia";
import { STATEWIDE_DE } from "./configs/delaware";
import { STATEWIDE_ND } from "./configs/north-dakota";
import { STATEWIDE_RI } from "./configs/rhode-island";
import { STATEWIDE_HI } from "./configs/hawaii";
import { STATEWIDE_ME } from "./configs/maine";
import { STATEWIDE_SD } from "./configs/south-dakota";
import { STATEWIDE_AK } from "./configs/alaska";
import { ELPASO_CO } from "./configs/colorado-springs";
import type { CountyAdapter, CountyAdapterConfig } from "./types";

const COUNTY_CONFIGS: CountyAdapterConfig[] = [
  CUYAHOGA_OH,
  ALLEGHENY_PA,
  WESTMORELAND_PA,
  BUTLER_PA,
  BEAVER_PA,
  ELPASO_CO,
];

const STATEWIDE_CONFIGS: Record<string, CountyAdapterConfig> = {
  OH: OGRIP_OH,
  CO: STATEWIDE_CO,
  WI: STATEWIDE_WI,
  MT: STATEWIDE_MT,
  NY: STATEWIDE_NY,
  AR: STATEWIDE_AR,
  TX: STATEWIDE_TX,
  FL: STATEWIDE_FL,
  GA: STATEWIDE_GA,
  NC: STATEWIDE_NC,
  VA: STATEWIDE_VA,
  TN: STATEWIDE_TN,
  AZ: STATEWIDE_AZ,
  IL: STATEWIDE_IL,
  CA: STATEWIDE_CA,
  NJ: STATEWIDE_NJ,
  MA: STATEWIDE_MA,
  MD: STATEWIDE_MD,
  WA: STATEWIDE_WA,
  OR: STATEWIDE_OR,
  MN: STATEWIDE_MN,
  MO: STATEWIDE_MO,
  IN: STATEWIDE_IN,
  MI: STATEWIDE_MI,
  SC: STATEWIDE_SC,
  LA: STATEWIDE_LA,
  NV: STATEWIDE_NV,
  CT: STATEWIDE_CT,
  UT: STATEWIDE_UT,
  KY: STATEWIDE_KY,
  PA: STATEWIDE_PA,
  NH: STATEWIDE_NH,
  IA: STATEWIDE_IA,
  KS: STATEWIDE_KS,
  NE: STATEWIDE_NE,
  OK: STATEWIDE_OK,
  AL: STATEWIDE_AL,
  MS: STATEWIDE_MS,
  NM: STATEWIDE_NM,
  ID: STATEWIDE_ID,
  VT: STATEWIDE_VT,
  WY: STATEWIDE_WY,
  WV: STATEWIDE_WV,
  DE: STATEWIDE_DE,
  ND: STATEWIDE_ND,
  RI: STATEWIDE_RI,
  HI: STATEWIDE_HI,
  ME: STATEWIDE_ME,
  SD: STATEWIDE_SD,
  AK: STATEWIDE_AK,
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

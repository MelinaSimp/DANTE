// lib/site-scan/adapters/configs/south-carolina.ts
// South Carolina statewide parcel data via SC Revenue and Fiscal Affairs.
// All 46 counties with county assessor data.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_SC: CountyAdapterConfig = {
  county: "*",
  state: "SC",
  serviceUrl:
    "https://services.arcgis.com/Pz54FMDsOzVwqfBH/ArcGIS/rest/services/SC_Statewide_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "TMS",
    address: "PHYADD",
    city: "PHYCITY",
    zip: "PHYZIP",
    zoning_class: "PROPUSE",
    zoning_description: "PROPUSE",
    land_area_sf: "Shape_Area",
    assessed_value_total: "TOTMKTVAL",
    assessed_value_land: "LNDMKTVAL",
    assessed_value_building: "BLGMKTVAL",
    market_value_total: "TOTMKTVAL",
    owner_name: "OWNNAME",
    land_use_code: "PROPUSE",
    land_use_description: "PROPUSE",
    tax_district: "COUNTY",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "C1", "C2", "C3", "COMM", "RET"],
    industrial: ["I", "I1", "I2", "I3", "MFG", "WHS"],
    residential: ["R", "R1", "R2", "R3", "R4", "RES"],
    office: ["OF", "OFF", "PROF"],
    mixed_use: ["MX", "MU", "PD"],
    vacant: ["AG", "VAC", "FOR", "MH"],
  },
};

// lib/site-scan/adapters/configs/new-hampshire.ts
// New Hampshire statewide parcel data via NH GRANIT.
// All 10 counties with municipal assessor parcels.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_NH: CountyAdapterConfig = {
  county: "*",
  state: "NH",
  serviceUrl:
    "https://services1.arcgis.com/a5juGxkXiJGqTECA/ArcGIS/rest/services/NH_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PID",
    address: "LOCATION",
    city: "TOWN",
    zip: "ZIP",
    zoning_class: "USE_CODE",
    zoning_description: "USE_DESC",
    land_area_sf: "Shape_Area",
    assessed_value_total: "TOTAL_APPR",
    assessed_value_land: "LAND_APPR",
    assessed_value_building: "BLDG_APPR",
    market_value_total: "TOTAL_APPR",
    owner_name: "OWNER",
    land_use_code: "USE_CODE",
    land_use_description: "USE_DESC",
    tax_district: "TOWN",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "C1", "C2", "CB"],
    industrial: ["I", "I1", "I2"],
    residential: ["R", "R1", "R2", "R3", "RA", "RC"],
    office: ["O", "OP"],
    mixed_use: ["MU", "MX", "PD"],
    vacant: ["AG", "FOR", "OS", "VAC"],
  },
};

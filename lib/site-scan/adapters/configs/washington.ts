// lib/site-scan/adapters/configs/washington.ts
// Washington statewide parcel data via WA Dept of Natural Resources
// WPDS (Washington Parcel Database System). All 39 counties.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_WA: CountyAdapterConfig = {
  county: "*",
  state: "WA",
  serviceUrl:
    "https://gis.dnr.wa.gov/site3/rest/services/Public_Boundaries/WADNR_PUBLIC_Cadastre_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCEL_ID",
    address: "SITUS_ADDRESS",
    city: "SITUS_CITY",
    zip: "SITUS_ZIP",
    zoning_class: "LAND_USE_CODE",
    zoning_description: "LAND_USE_DESC",
    land_area_sf: "Shape_Area",
    assessed_value_total: "ASSESSED_VALUE",
    assessed_value_land: "LAND_VALUE",
    assessed_value_building: "IMPROVEMENT_VALUE",
    market_value_total: "MARKET_VALUE",
    owner_name: "OWNER_NAME",
    land_use_code: "LAND_USE_CODE",
    land_use_description: "LAND_USE_DESC",
    tax_district: "COUNTY_NAME",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "C1", "C2", "C3", "GC", "NC", "RC"],
    industrial: ["I", "I1", "I2", "LI", "HI", "BP"],
    residential: ["R1", "R2", "R3", "R4", "R5", "R6", "RS", "RM"],
    office: ["O", "OC", "OP", "OR"],
    mixed_use: ["MU", "MX", "UR", "TC"],
    vacant: ["AG", "FOR", "OS", "VAC", "RR"],
  },
};

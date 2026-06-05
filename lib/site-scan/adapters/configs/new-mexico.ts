// lib/site-scan/adapters/configs/new-mexico.ts
// New Mexico statewide parcel data via NM Resource Geographic Information System.
// All 33 counties.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_NM: CountyAdapterConfig = {
  county: "*",
  state: "NM",
  serviceUrl:
    "https://services2.arcgis.com/qWZ7BaZXaP5isnfT/ArcGIS/rest/services/NM_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCEL_ID",
    address: "SITUS_ADDR",
    city: "SITUS_CITY",
    zip: "SITUS_ZIP",
    zoning_class: "LAND_USE",
    zoning_description: "LAND_USE",
    land_area_sf: "ACREAGE",
    assessed_value_total: "TOTAL_VAL",
    assessed_value_land: "LAND_VAL",
    assessed_value_building: "BLDG_VAL",
    market_value_total: "TOTAL_VAL",
    owner_name: "OWNER_NAME",
    land_use_code: "LAND_USE",
    land_use_description: "LAND_USE",
    tax_district: "COUNTY",
  },
  areaFieldIsAcres: true,
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C-1", "C-2", "C-3", "SU"],
    industrial: ["I-P", "I-1", "I-2", "M-1"],
    residential: ["R-1", "R-2", "R-3", "R-4", "R-T"],
    office: ["O-1", "IP"],
    mixed_use: ["MX", "PD", "SU"],
    vacant: ["A-1", "A-2", "RA", "RR"],
  },
};

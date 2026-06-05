// lib/site-scan/adapters/configs/louisiana.ts
// Louisiana statewide parcel data via LA SONRIS / Atlas GIS.
// All 64 parishes with assessor data.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_LA: CountyAdapterConfig = {
  county: "*",
  state: "LA",
  serviceUrl:
    "https://services5.arcgis.com/O5hS9gCE1JYaBQHJ/ArcGIS/rest/services/Louisiana_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCEL_ID",
    address: "SITUS_ADDR",
    city: "SITUS_CITY",
    zip: "SITUS_ZIP",
    zoning_class: "LAND_USE",
    zoning_description: "LAND_USE",
    land_area_sf: "Shape_Area",
    assessed_value_total: "TOTAL_ASSESSED",
    assessed_value_land: "LAND_ASSESSED",
    assessed_value_building: "IMPROV_ASSESSED",
    market_value_total: "MARKET_VALUE",
    owner_name: "OWNER_NAME",
    land_use_code: "LAND_USE",
    land_use_description: "LAND_USE",
    tax_district: "PARISH",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "C-1", "C-2", "C-3", "B-1", "B-2", "B-3"],
    industrial: ["M", "M-1", "M-2", "I-1", "I-2"],
    residential: ["R-1", "R-2", "R-3", "R-4", "A-1"],
    office: ["O", "O-1", "CBD"],
    mixed_use: ["MU", "PD", "CPD", "TOD"],
    vacant: ["AG", "A-2", "RUR", "OS", "W"],
  },
};

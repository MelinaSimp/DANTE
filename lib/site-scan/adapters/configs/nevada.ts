// lib/site-scan/adapters/configs/nevada.ts
// Nevada statewide parcel data via NV State Lands / GIS portal.
// All 17 counties (16 counties + Carson City independent).

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_NV: CountyAdapterConfig = {
  county: "*",
  state: "NV",
  serviceUrl:
    "https://services.arcgis.com/njFNhDsUCentVYJW/ArcGIS/rest/services/Nevada_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "APN",
    address: "SITUS_ADDR",
    city: "SITUS_CITY",
    zip: "SITUS_ZIP",
    zoning_class: "LAND_USE",
    zoning_description: "LAND_USE_DESC",
    land_area_sf: "Shape_Area",
    assessed_value_total: "TAXABLE_VALUE",
    assessed_value_land: "LAND_VALUE",
    assessed_value_building: "IMPROV_VALUE",
    market_value_total: "TAXABLE_VALUE",
    owner_name: "OWNER_NAME",
    land_use_code: "LAND_USE",
    land_use_description: "LAND_USE_DESC",
    tax_district: "COUNTY_NAME",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "C-1", "C-2", "GC", "TC", "SC"],
    industrial: ["M", "M-1", "M-2", "IP", "I-1"],
    residential: ["R-1", "R-2", "R-3", "R-4", "R-E", "SFR"],
    office: ["O", "OP", "PO"],
    mixed_use: ["MU", "MPC", "PD", "TC"],
    vacant: ["AG", "OS", "VAC", "RUR", "U"],
  },
};

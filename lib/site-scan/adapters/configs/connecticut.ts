// lib/site-scan/adapters/configs/connecticut.ts
// Connecticut statewide parcel data via CT DEEP GIS Open Data.
// All 169 municipalities with grand list assessment data.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_CT: CountyAdapterConfig = {
  county: "*",
  state: "CT",
  serviceUrl:
    "https://services1.arcgis.com/FjPcSmEFuDYlIdKC/ArcGIS/rest/services/Connecticut_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "GIS_ID",
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
    retail: ["C", "CA", "CB", "CC", "CD", "CG"],
    industrial: ["I", "IA", "IB", "IG", "IP"],
    residential: ["R", "RA", "RB", "RC", "RD", "RE", "RF"],
    office: ["OD", "OP", "OC"],
    mixed_use: ["MX", "MU", "DD", "TOD"],
    vacant: ["OS", "RUR", "AA", "FAR"],
  },
};

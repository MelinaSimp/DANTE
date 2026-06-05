// lib/site-scan/adapters/configs/mississippi.ts
// Mississippi statewide parcel data via MARIS.
// All 82 counties.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_MS: CountyAdapterConfig = {
  county: "*",
  state: "MS",
  serviceUrl:
    "https://services5.arcgis.com/RVfMgas85kx7Llgj/ArcGIS/rest/services/Mississippi_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCEL_ID",
    address: "PROP_ADDR",
    city: "PROP_CITY",
    zip: "PROP_ZIP",
    zoning_class: "LAND_USE",
    zoning_description: "LAND_USE",
    land_area_sf: "ACREAGE",
    assessed_value_total: "TOTAL_ASSESSED",
    assessed_value_land: "LAND_ASSESSED",
    assessed_value_building: "IMPROV_ASSESSED",
    market_value_total: "MARKET_VALUE",
    owner_name: "OWNER_NAME",
    land_use_code: "LAND_USE",
    land_use_description: "LAND_USE",
    tax_district: "COUNTY",
  },
  areaFieldIsAcres: true,
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "C-1", "C-2", "C-3"],
    industrial: ["I", "I-1", "I-2", "M-1"],
    residential: ["R-1", "R-2", "R-3", "R-4", "R-5"],
    office: ["O", "O-1"],
    mixed_use: ["PD", "MU"],
    vacant: ["AG", "A-1", "F"],
  },
};

// lib/site-scan/adapters/configs/michigan.ts
// Michigan statewide parcel data via State of Michigan Open Data Portal.
// All 83 counties with equalization and assessment data.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_MI: CountyAdapterConfig = {
  county: "*",
  state: "MI",
  serviceUrl:
    "https://services3.arcgis.com/MVhnoJmcVFr2Z9Wi/ArcGIS/rest/services/Michigan_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCELID",
    address: "PROPSTREETCOMBINED",
    city: "PROPCITY",
    zip: "PROPZIP",
    zoning_class: "USECLASS",
    zoning_description: "USEDESC",
    land_area_sf: "Shape_Area",
    assessed_value_total: "TOTALASSESS",
    assessed_value_land: "LANDASSESS",
    assessed_value_building: "BLDGASSESS",
    market_value_total: "TRUECASHVALUE",
    owner_name: "OWNERNAME",
    land_use_code: "USECLASS",
    land_use_description: "USEDESC",
    tax_district: "COUNTYNAME",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["201", "202", "203", "204", "205", "300"],
    industrial: ["301", "302", "303", "304", "305", "400"],
    residential: ["101", "102", "103", "104", "105", "106"],
    office: ["206", "207", "208"],
    mixed_use: ["210", "211"],
    vacant: ["100", "200", "401", "402", "600", "700"],
  },
};

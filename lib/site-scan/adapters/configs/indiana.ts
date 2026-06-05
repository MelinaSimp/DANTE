// lib/site-scan/adapters/configs/indiana.ts
// Indiana statewide parcel data via IndianaMap / IGWS.
// All 92 counties with county assessor parcel boundaries.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_IN: CountyAdapterConfig = {
  county: "*",
  state: "IN",
  serviceUrl:
    "https://services.indianamap.org/arcgis/rest/services/Framework/Parcels_Current/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCEL_NUM",
    address: "PROP_ADDR",
    city: "PROP_CITY",
    zip: "PROP_ZIP",
    zoning_class: "CLASS_CODE",
    zoning_description: "CLASS_DESC",
    land_area_sf: "Shape_Area",
    assessed_value_total: "TOTAL_AV",
    assessed_value_land: "LAND_AV",
    assessed_value_building: "IMPROV_AV",
    market_value_total: "TOTAL_AV",
    owner_name: "OWNER_NAME",
    land_use_code: "CLASS_CODE",
    land_use_description: "CLASS_DESC",
    tax_district: "COUNTY_NAME",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["500", "501", "502", "503", "504", "505"],
    industrial: ["600", "601", "602", "603", "604"],
    residential: ["100", "101", "102", "103", "200", "201", "202"],
    office: ["510", "511", "512"],
    mixed_use: ["520", "521"],
    vacant: ["900", "901", "902", "910", "920"],
  },
};

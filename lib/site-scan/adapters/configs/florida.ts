// lib/site-scan/adapters/configs/florida.ts
// Florida statewide parcel data via the FL Department of Revenue
// GIS open data. All 67 counties with standardized NAL schema.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_FL: CountyAdapterConfig = {
  county: "*",
  state: "FL",
  serviceUrl:
    "https://services1.arcgis.com/O1JpcwDW8sjYuddV/ArcGIS/rest/services/Florida_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCELNO",
    address: "SITEADDR",
    city: "SITECITY",
    zip: "SITEZIP",
    zoning_class: "DOR_UC",
    zoning_description: "DOR_UC",
    land_area_sf: "Shape_Area",
    assessed_value_total: "JV",
    assessed_value_land: "LND_VAL",
    assessed_value_building: "BLDG_VAL",
    market_value_total: "JV",
    owner_name: "OWN_NAME",
    land_use_code: "DOR_UC",
    land_use_description: "DOR_UC",
    tax_district: "CO_NO",
    last_sale_date: "APTS_DATE",
    last_sale_price: "APTS_PRICE",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["11", "12", "13", "14", "15", "16", "17"],
    industrial: ["41", "42", "43", "44", "45", "46", "47", "48"],
    residential: ["01", "02", "03", "04", "05", "06", "07", "08"],
    office: ["17", "18", "19"],
    mixed_use: ["23", "24", "25", "26", "27", "28", "29"],
    vacant: ["00", "10", "60", "61", "62", "63", "64", "65", "66", "67"],
  },
};

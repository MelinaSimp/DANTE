// lib/site-scan/adapters/configs/north-carolina.ts
// North Carolina statewide parcel data via NC OneMap.
// All 100 counties with standardized NCPARCELS schema.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_NC: CountyAdapterConfig = {
  county: "*",
  state: "NC",
  serviceUrl:
    "https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARNO",
    address: "SITEADD",
    city: "SITECITY",
    zip: "SITEZIP",
    zoning_class: "LANDUSE",
    zoning_description: "LANDUSE",
    land_area_sf: "ACREAGE",
    assessed_value_total: "TOTALVAL",
    assessed_value_land: "LANDVAL",
    assessed_value_building: "BLDGVAL",
    market_value_total: "TOTALVAL",
    owner_name: "OWNNAME",
    land_use_code: "LANDUSE",
    land_use_description: "LANDUSE",
    tax_district: "COUNTY",
    last_sale_date: "SALEDATE",
    last_sale_price: "SALEPRICE",
  },
  areaFieldIsAcres: true,
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["100", "101", "102", "103", "110"],
    industrial: ["200", "201", "202", "203", "210"],
    residential: ["300", "301", "302", "303", "310"],
    office: ["150", "151", "152"],
    mixed_use: ["400", "401", "402"],
    vacant: ["600", "601", "602", "700"],
  },
};

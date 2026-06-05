// lib/site-scan/adapters/configs/massachusetts.ts
// Massachusetts statewide parcel data via MassGIS Level 3 Assessor Parcels.
// All 351 municipalities with standardized assessor schema.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_MA: CountyAdapterConfig = {
  county: "*",
  state: "MA",
  serviceUrl:
    "https://services1.arcgis.com/hGdE1joQKEaQmSoC/ArcGIS/rest/services/MassGIS_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "LOC_ID",
    address: "SITE_ADDR",
    city: "TOWN",
    zip: "ZIP_CODE",
    zoning_class: "USE_CODE",
    zoning_description: "USE_DESC",
    land_area_sf: "LOT_SIZE",
    assessed_value_total: "TOTAL_VAL",
    assessed_value_land: "LAND_VAL",
    assessed_value_building: "BLDG_VAL",
    market_value_total: "TOTAL_VAL",
    owner_name: "OWNER1",
    land_use_code: "USE_CODE",
    land_use_description: "USE_DESC",
    tax_district: "TOWN",
    year_built: "YEAR_BUILT",
    building_sf: "BLD_AREA",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["300", "310", "320", "321", "322", "323", "324", "325", "326"],
    industrial: ["400", "401", "402", "403", "404"],
    residential: ["101", "102", "103", "104", "105", "109", "111", "112"],
    office: ["340", "341", "342", "343"],
    mixed_use: ["013", "031", "032", "033", "034"],
    vacant: ["130", "131", "132", "390", "391", "392"],
  },
};

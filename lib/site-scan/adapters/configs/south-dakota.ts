// lib/site-scan/adapters/configs/south-dakota.ts
// South Dakota statewide parcel data via SD GIS Hub
// (South Dakota Department of Revenue). All 66 counties.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_SD: CountyAdapterConfig = {
  county: "*",
  state: "SD",
  serviceUrl:
    "https://arcgis.sd.gov/arcgis/rest/services/SD_All/Parcels_and_Boundaries/MapServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCEL_ID",
    address: "",
    city: "",
    zip: "",
    zoning_class: "",
    zoning_description: "",
    land_area_sf: "CALC_ACRES",
    assessed_value_total: "",
    assessed_value_land: "",
    assessed_value_building: "",
    market_value_total: "",
    owner_name: "OWNER_NAME",
    land_use_code: "",
    land_use_description: "",
    tax_district: "COUNTY_NAME",
  },
  areaFieldIsAcres: true,
  useWildcardOutFields: true,
  zoningClassMap: {},
};

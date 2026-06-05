// lib/site-scan/adapters/configs/maine.ts
// Maine statewide parcel data via Maine GeoLibrary (Maine Office
// of GIS). Covers municipalities that have submitted digital
// parcel data to the state program.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_ME: CountyAdapterConfig = {
  county: "*",
  state: "ME",
  serviceUrl:
    "https://gis.maine.gov/arcgis/rest/services/cadastral/Maine_Parcels_Organized_Towns/MapServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "MAP_BK_LOT",
    address: "PHYADD",
    city: "TOWN",
    zip: "",
    zoning_class: "",
    zoning_description: "",
    land_area_sf: "ACREAGE",
    assessed_value_total: "TOTAL_VAL",
    assessed_value_land: "LAND_VAL",
    assessed_value_building: "BLDG_VAL",
    market_value_total: "",
    owner_name: "OWNER",
    land_use_code: "LAND_USE_CODE",
    land_use_description: "",
    tax_district: "TOWN",
  },
  areaFieldIsAcres: true,
  useWildcardOutFields: true,
  zoningClassMap: {},
};

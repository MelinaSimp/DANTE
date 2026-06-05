// lib/site-scan/adapters/configs/hawaii.ts
// Hawaii statewide parcel data via Hawaii Statewide GIS Program.
// All 4 counties (Hawaii, Honolulu, Kauai, Maui).

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_HI: CountyAdapterConfig = {
  county: "*",
  state: "HI",
  serviceUrl:
    "https://geodata.hawaii.gov/arcgis/rest/services/ParcelsZoning/MapServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "TMK",
    address: "",
    city: "",
    zip: "",
    zoning_class: "zone",
    zoning_description: "",
    land_area_sf: "ACREAGE",
    assessed_value_total: "",
    assessed_value_land: "",
    assessed_value_building: "",
    market_value_total: "",
    owner_name: "",
    land_use_code: "LU_Desc",
    land_use_description: "",
    tax_district: "County",
  },
  areaFieldIsAcres: true,
  useWildcardOutFields: true,
  zoningClassMap: {},
};

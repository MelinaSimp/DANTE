// lib/site-scan/adapters/configs/alaska.ts
// Alaska statewide parcel data via Alaska DNR Land Records.
// Coverage varies — organized boroughs and some unorganized areas.
// Sparse attribute set due to fragmented local assessor systems.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_AK: CountyAdapterConfig = {
  county: "*",
  state: "AK",
  serviceUrl:
    "https://arcgis.dnr.alaska.gov/arcgis/rest/services/OpenData/Physical_Land_Features/MapServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCEL_ID",
    address: "",
    city: "",
    zip: "",
    zoning_class: "",
    zoning_description: "",
    land_area_sf: "ACRES",
    assessed_value_total: "",
    assessed_value_land: "",
    assessed_value_building: "",
    market_value_total: "",
    owner_name: "",
    land_use_code: "",
    land_use_description: "",
    tax_district: "",
  },
  areaFieldIsAcres: true,
  useWildcardOutFields: true,
  zoningClassMap: {},
};

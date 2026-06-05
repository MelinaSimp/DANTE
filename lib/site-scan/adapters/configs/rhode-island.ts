// lib/site-scan/adapters/configs/rhode-island.ts
// Rhode Island statewide parcel data via RIGIS (RI Geographic
// Information System). All 39 municipalities.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_RI: CountyAdapterConfig = {
  county: "*",
  state: "RI",
  serviceUrl:
    "https://services2.arcgis.com/S8zZg9pg23JUEexQ/arcgis/rest/services/RI_Statewide_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PLAT_LOT",
    address: "ADDR",
    city: "TOWN",
    zip: "",
    zoning_class: "ZONE",
    zoning_description: "",
    land_area_sf: "ACRES",
    assessed_value_total: "TOTAL_ASSE",
    assessed_value_land: "LAND_ASSES",
    assessed_value_building: "BLDG_ASSES",
    market_value_total: "",
    owner_name: "OWNER",
    land_use_code: "LAND_USE",
    land_use_description: "",
    tax_district: "TOWN",
  },
  areaFieldIsAcres: true,
  useWildcardOutFields: true,
  zoningClassMap: {},
};

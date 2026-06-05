// lib/site-scan/adapters/configs/oklahoma.ts
// Oklahoma statewide parcel data via OKMaps.
// All 77 counties.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_OK: CountyAdapterConfig = {
  county: "*",
  state: "OK",
  serviceUrl:
    "https://services6.arcgis.com/LsMoQTrSMPUMmeKq/ArcGIS/rest/services/Oklahoma_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCEL_ID",
    address: "SITUS_ADDR",
    city: "SITUS_CITY",
    zip: "SITUS_ZIP",
    zoning_class: "LAND_USE",
    zoning_description: "LAND_USE",
    land_area_sf: "Shape_Area",
    assessed_value_total: "ASSESSED_VAL",
    assessed_value_land: "LAND_VAL",
    assessed_value_building: "IMPROV_VAL",
    market_value_total: "MARKET_VAL",
    owner_name: "OWNER_NAME",
    land_use_code: "LAND_USE",
    land_use_description: "LAND_USE",
    tax_district: "COUNTY",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "C-1", "C-2", "C-3", "CG", "CH"],
    industrial: ["I", "I-1", "I-2", "IL", "IH"],
    residential: ["R-1", "R-2", "R-3", "R-4", "RS", "RE"],
    office: ["O", "O-1", "OP"],
    mixed_use: ["PD", "MU", "MX"],
    vacant: ["AG", "A-1", "A-2", "RR"],
  },
};

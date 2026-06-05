// lib/site-scan/adapters/configs/iowa.ts
// Iowa statewide parcel data via Iowa Geodata.
// All 99 counties with assessor data.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_IA: CountyAdapterConfig = {
  county: "*",
  state: "IA",
  serviceUrl:
    "https://programs.iowadnr.gov/geospatial/rest/services/Boundaries/Iowa_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCEL_ID",
    address: "PROP_ADDR",
    city: "PROP_CITY",
    zip: "PROP_ZIP",
    zoning_class: "LAND_USE",
    zoning_description: "LAND_USE",
    land_area_sf: "Shape_Area",
    assessed_value_total: "TOTAL_VALUE",
    assessed_value_land: "LAND_VALUE",
    assessed_value_building: "BLDG_VALUE",
    market_value_total: "TOTAL_VALUE",
    owner_name: "OWNER_NAME",
    land_use_code: "LAND_USE",
    land_use_description: "LAND_USE",
    tax_district: "COUNTY",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "C-1", "C-2", "C-3"],
    industrial: ["M", "M-1", "M-2", "I"],
    residential: ["R-1", "R-2", "R-3", "R-4"],
    office: ["O", "O-1"],
    mixed_use: ["PD", "MU"],
    vacant: ["AG", "A-1", "A-2"],
  },
};

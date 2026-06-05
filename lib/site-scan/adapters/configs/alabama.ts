// lib/site-scan/adapters/configs/alabama.ts
// Alabama statewide parcel data via Alabama Maps portal.
// All 67 counties.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_AL: CountyAdapterConfig = {
  county: "*",
  state: "AL",
  serviceUrl:
    "https://services.arcgis.com/LcQjj2sL7Txk9Lag/ArcGIS/rest/services/Alabama_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCEL_ID",
    address: "PHYS_ADDR",
    city: "PHYS_CITY",
    zip: "PHYS_ZIP",
    zoning_class: "LAND_USE",
    zoning_description: "LAND_USE",
    land_area_sf: "Shape_Area",
    assessed_value_total: "ASSESSED",
    assessed_value_land: "LAND_VAL",
    assessed_value_building: "BLDG_VAL",
    market_value_total: "MARKET_VAL",
    owner_name: "OWNER",
    land_use_code: "LAND_USE",
    land_use_description: "LAND_USE",
    tax_district: "COUNTY",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "C-1", "C-2", "C-3", "B-1", "B-2"],
    industrial: ["I", "I-1", "I-2", "M-1", "M-2"],
    residential: ["R-1", "R-2", "R-3", "R-4"],
    office: ["O", "O-1", "OP"],
    mixed_use: ["PD", "MU"],
    vacant: ["AG", "A-1", "TF"],
  },
};

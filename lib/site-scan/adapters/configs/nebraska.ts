// lib/site-scan/adapters/configs/nebraska.ts
// Nebraska statewide parcel data via NebraskaMAP.
// All 93 counties with assessor data.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_NE: CountyAdapterConfig = {
  county: "*",
  state: "NE",
  serviceUrl:
    "https://maps.ne.gov/arcgis/rest/services/Parcels/Nebraska_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCEL_ID",
    address: "ADDRESS",
    city: "CITY",
    zip: "ZIP",
    zoning_class: "LAND_USE",
    zoning_description: "LAND_USE",
    land_area_sf: "Shape_Area",
    assessed_value_total: "TOTAL_VAL",
    assessed_value_land: "LAND_VAL",
    assessed_value_building: "IMPR_VAL",
    market_value_total: "TOTAL_VAL",
    owner_name: "OWNER",
    land_use_code: "LAND_USE",
    land_use_description: "LAND_USE",
    tax_district: "COUNTY",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "C-1", "C-2", "C-3", "B-1", "B-2"],
    industrial: ["I", "I-1", "I-2", "M-1"],
    residential: ["R-1", "R-2", "R-3", "R-4", "R-5"],
    office: ["O", "O-1"],
    mixed_use: ["PD", "MU"],
    vacant: ["AG", "A-1", "RR"],
  },
};

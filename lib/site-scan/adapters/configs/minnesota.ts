// lib/site-scan/adapters/configs/minnesota.ts
// Minnesota statewide parcel data via MN Geospatial Commons.
// Statewide parcel dataset from county assessors, all 87 counties.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_MN: CountyAdapterConfig = {
  county: "*",
  state: "MN",
  serviceUrl:
    "https://gis.mn.gov/arcgis/rest/services/plan_parcel/parcels_state/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PIN",
    address: "BLDG_NUM",
    city: "PLAT_NAME",
    zip: "ZIP",
    zoning_class: "USE1_DESC",
    zoning_description: "USE1_DESC",
    land_area_sf: "Shape_Area",
    assessed_value_total: "EMV_TOTAL",
    assessed_value_land: "EMV_LAND",
    assessed_value_building: "EMV_BLDG",
    market_value_total: "EMV_TOTAL",
    owner_name: "OWNER_NAME",
    land_use_code: "USE1_DESC",
    land_use_description: "USE1_DESC",
    tax_district: "CO_NAME",
    year_built: "YEAR_BUILT",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["COMMERCIAL", "RETAIL", "C-1", "C-2", "B-1", "B-2"],
    industrial: ["INDUSTRIAL", "I-1", "I-2"],
    residential: ["RESIDENTIAL", "R-1", "R-2", "R-3", "R-4"],
    office: ["OFFICE", "O-1"],
    mixed_use: ["MIXED USE", "PUD"],
    vacant: ["AGRICULTURAL", "RURAL", "AG", "VAC"],
  },
};

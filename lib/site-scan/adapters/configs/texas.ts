// lib/site-scan/adapters/configs/texas.ts
// Texas statewide parcel data via Texas Natural Resources Information System (TNRIS)
// StratMap parcels layer. Covers all 254 counties with standardized schema.
// MaxRecords: 2,000.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_TX: CountyAdapterConfig = {
  county: "*",
  state: "TX",
  serviceUrl:
    "https://feature.lcra.org/arcgis/rest/services/Public/TNRIS_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "geo_id",
    address: "situs_addr",
    city: "situs_city",
    zip: "situs_zip",
    zoning_class: "land_use",
    zoning_description: "land_use",
    land_area_sf: "Shape_Area",
    assessed_value_total: "appraised_value",
    assessed_value_land: "land_value",
    assessed_value_building: "improvement_value",
    market_value_total: "market_value",
    owner_name: "owner_name",
    land_use_code: "land_use",
    land_use_description: "land_use",
    tax_district: "county_name",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "C1", "C2", "C3", "COMM", "RETAIL"],
    industrial: ["I", "I1", "I2", "IND", "INDUSTRIAL"],
    residential: ["R", "R1", "R2", "R3", "RES", "RESIDENTIAL"],
    office: ["O", "OFF", "OFFICE"],
    mixed_use: ["MU", "MX", "MIXED", "PD", "PUD"],
    vacant: ["VAC", "VACANT", "AG", "AGRI", "AGRICULTURAL"],
  },
};

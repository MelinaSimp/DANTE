// lib/site-scan/adapters/configs/virginia.ts
// Virginia statewide parcel data via Virginia Geographic Information
// Network (VGIN). All independent cities and counties.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_VA: CountyAdapterConfig = {
  county: "*",
  state: "VA",
  serviceUrl:
    "https://services.arcgis.com/p5v98VHDX9Atv3l7/ArcGIS/rest/services/Virginia_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCEL_ID",
    address: "SITUS_ADDR",
    city: "SITUS_CITY",
    zip: "SITUS_ZIP",
    zoning_class: "LAND_USE",
    zoning_description: "LAND_USE_DESC",
    land_area_sf: "ACREAGE",
    assessed_value_total: "TOTAL_ASSESS",
    assessed_value_land: "LAND_ASSESS",
    assessed_value_building: "IMPR_ASSESS",
    market_value_total: "TOTAL_ASSESS",
    owner_name: "OWNER_NAME",
    land_use_code: "LAND_USE",
    land_use_description: "LAND_USE_DESC",
    tax_district: "LOCALITY",
    last_sale_date: "SALE_DATE",
    last_sale_price: "SALE_PRICE",
  },
  areaFieldIsAcres: true,
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "C1", "C2", "COM", "COMMERCIAL"],
    industrial: ["I", "I1", "I2", "IND", "INDUSTRIAL"],
    residential: ["R", "R1", "R2", "RES", "RESIDENTIAL"],
    office: ["O", "OFF", "OFFICE"],
    mixed_use: ["MU", "MX", "PD", "PUD"],
    vacant: ["VAC", "AG", "AGRICULTURAL"],
  },
};

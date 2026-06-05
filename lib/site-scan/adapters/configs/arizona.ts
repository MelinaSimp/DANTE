// lib/site-scan/adapters/configs/arizona.ts
// Arizona statewide parcel data via AZ State Land Department
// GIS services. All 15 counties.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_AZ: CountyAdapterConfig = {
  county: "*",
  state: "AZ",
  serviceUrl:
    "https://services.arcgis.com/pdMFKzb8Z8SBgh2h/ArcGIS/rest/services/Arizona_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "APN",
    address: "SITUS_ADDR",
    city: "SITUS_CITY",
    zip: "SITUS_ZIP",
    zoning_class: "LAND_USE",
    zoning_description: "LAND_USE_DESC",
    land_area_sf: "ACRES",
    assessed_value_total: "TOTAL_ASSESS",
    assessed_value_land: "LAND_ASSESS",
    assessed_value_building: "IMPR_ASSESS",
    market_value_total: "FULL_CASH_VAL",
    owner_name: "OWNER_NAME",
    land_use_code: "LAND_USE",
    land_use_description: "LAND_USE_DESC",
    tax_district: "COUNTY",
    last_sale_date: "LAST_SALE_DATE",
    last_sale_price: "LAST_SALE_PRICE",
  },
  areaFieldIsAcres: true,
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "C-1", "C-2", "C-3", "COM"],
    industrial: ["I", "I-1", "I-2", "IND"],
    residential: ["R", "R-1", "R-2", "R-3", "R-4", "R-5"],
    office: ["O", "C-O", "OFFICE"],
    mixed_use: ["MU", "PD", "PAD"],
    vacant: ["VAC", "AG", "RURAL"],
  },
};

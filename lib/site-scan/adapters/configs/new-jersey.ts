// lib/site-scan/adapters/configs/new-jersey.ts
// New Jersey statewide parcel data via NJ Geographic Information Network (NJGIN).
// All 21 counties with MOD-IV tax list schema.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_NJ: CountyAdapterConfig = {
  county: "*",
  state: "NJ",
  serviceUrl:
    "https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/NJ_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PAMS_PIN",
    address: "PROP_LOC",
    city: "MUN_NAME",
    zip: "ZIP_CODE",
    zoning_class: "PROP_CLASS",
    zoning_description: "PROP_CLASS",
    land_area_sf: "Shape_Area",
    assessed_value_total: "TOTAL_ASMT",
    assessed_value_land: "LAND_ASMT",
    assessed_value_building: "IMPR_ASMT",
    market_value_total: "TOTAL_ASMT",
    owner_name: "OWNER_NAME",
    land_use_code: "PROP_CLASS",
    land_use_description: "PROP_CLASS",
    tax_district: "COUNTY",
    last_sale_date: "SALE_DATE",
    last_sale_price: "SALE_PRICE",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["4A", "4B", "4C"],
    industrial: ["4A", "5A", "5B"],
    residential: ["1", "2", "3A", "3B"],
    office: ["4A"],
    mixed_use: ["4C", "15C"],
    vacant: ["1", "3A", "5A", "15A"],
  },
};

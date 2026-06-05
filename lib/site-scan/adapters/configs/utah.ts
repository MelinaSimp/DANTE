// lib/site-scan/adapters/configs/utah.ts
// Utah statewide parcel data via UGRC (Utah Geospatial Resource Center).
// All 29 counties with SGID parcels layer.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_UT: CountyAdapterConfig = {
  county: "*",
  state: "UT",
  serviceUrl:
    "https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/Utah_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCEL_ID",
    address: "PARCEL_ADD",
    city: "PARCEL_CITY",
    zip: "PARCEL_ZIP",
    zoning_class: "PROP_CLASS",
    zoning_description: "PROP_CLASS",
    land_area_sf: "Shape_Area",
    assessed_value_total: "TOTAL_MKT_VALUE",
    assessed_value_land: "LAND_MKT_VALUE",
    assessed_value_building: "BLDG_MKT_VALUE",
    market_value_total: "TOTAL_MKT_VALUE",
    owner_name: "OWNER_NAME",
    land_use_code: "PROP_CLASS",
    land_use_description: "PROP_CLASS",
    tax_district: "COUNTY_NAME",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "C-1", "C-2", "C-3", "CC", "CG", "CN", "SC"],
    industrial: ["M", "M-1", "M-2", "LI", "HI", "EI"],
    residential: ["R-1", "R-2", "R-3", "R-4", "R-5", "SFR", "MFR"],
    office: ["O", "OP", "PO", "BP"],
    mixed_use: ["MU", "MX", "FC", "TC"],
    vacant: ["AG", "FA", "GA", "OS", "RA"],
  },
};

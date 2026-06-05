// lib/site-scan/adapters/configs/missouri.ts
// Missouri statewide parcel data via MO Spatial Data Information Service (MSDIS).
// County assessor parcels aggregated statewide, 114 counties + St. Louis City.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_MO: CountyAdapterConfig = {
  county: "*",
  state: "MO",
  serviceUrl:
    "https://services6.arcgis.com/wyBrn5v4QTmy4fZj/ArcGIS/rest/services/Missouri_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCEL_ID",
    address: "SITUS_ADDR",
    city: "SITUS_CITY",
    zip: "SITUS_ZIP",
    zoning_class: "PROP_CLASS",
    zoning_description: "PROP_CLASS",
    land_area_sf: "Shape_Area",
    assessed_value_total: "TOTAL_APPRAISED",
    assessed_value_land: "LAND_VALUE",
    assessed_value_building: "IMP_VALUE",
    market_value_total: "TOTAL_APPRAISED",
    owner_name: "OWNER",
    land_use_code: "PROP_CLASS",
    land_use_description: "PROP_CLASS",
    tax_district: "COUNTY_NAME",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "C-1", "C-2", "C-3", "GC", "CP"],
    industrial: ["M", "M-1", "M-2", "M-3", "IP"],
    residential: ["R-1", "R-2", "R-3", "R-4", "R-5", "R-6"],
    office: ["O", "OP", "OT"],
    mixed_use: ["MXD", "PD", "COR"],
    vacant: ["AG", "A-1", "A-2", "OS", "FP"],
  },
};

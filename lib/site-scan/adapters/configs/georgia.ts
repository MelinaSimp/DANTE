// lib/site-scan/adapters/configs/georgia.ts
// Georgia statewide parcel data via Georgia GIS Clearinghouse.
// 159 counties with standardized parcel attributes.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_GA: CountyAdapterConfig = {
  county: "*",
  state: "GA",
  serviceUrl:
    "https://services2.arcgis.com/5MVnth5IDHkY3uHN/ArcGIS/rest/services/Georgia_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCEL_ID",
    address: "SITUS_ADDR",
    city: "SITUS_CITY",
    zip: "SITUS_ZIP",
    zoning_class: "LAND_USE",
    zoning_description: "LAND_USE",
    land_area_sf: "ACREAGE",
    assessed_value_total: "APPRAISED",
    assessed_value_land: "LAND_APPR",
    assessed_value_building: "BLDG_APPR",
    market_value_total: "FAIR_MKT",
    owner_name: "OWNER",
    land_use_code: "LAND_USE",
    land_use_description: "LAND_USE",
    tax_district: "COUNTY",
  },
  areaFieldIsAcres: true,
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "C1", "C2", "COM", "COMMERCIAL"],
    industrial: ["I", "I1", "IND", "INDUSTRIAL"],
    residential: ["R", "R1", "R2", "RES", "RESIDENTIAL"],
    office: ["O", "OFF", "OFFICE"],
    mixed_use: ["MU", "MX", "PD"],
    vacant: ["VAC", "AG", "AGRICULTURAL"],
  },
};

// lib/site-scan/adapters/configs/illinois.ts
// Illinois statewide parcel data via Illinois GIS Clearinghouse.
// All 102 counties.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_IL: CountyAdapterConfig = {
  county: "*",
  state: "IL",
  serviceUrl:
    "https://clearinghouse.isgs.illinois.edu/arcgis/rest/services/Parcels/Illinois_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PIN",
    address: "SITEADDR",
    city: "SITECITY",
    zip: "SITEZIP",
    zoning_class: "LANDUSE",
    zoning_description: "LANDUSE",
    land_area_sf: "ACRES",
    assessed_value_total: "TOTAL_AV",
    assessed_value_land: "LAND_AV",
    assessed_value_building: "BLDG_AV",
    market_value_total: "TOTAL_AV",
    owner_name: "OWNER",
    land_use_code: "LANDUSE",
    land_use_description: "LANDUSE",
    tax_district: "COUNTY",
  },
  areaFieldIsAcres: true,
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["200", "201", "202", "COM", "COMMERCIAL"],
    industrial: ["300", "301", "302", "IND", "INDUSTRIAL"],
    residential: ["100", "101", "102", "103", "RES"],
    office: ["250", "251", "OFF"],
    mixed_use: ["400", "PD", "PUD"],
    vacant: ["000", "100", "VAC", "FARM", "AG"],
  },
};

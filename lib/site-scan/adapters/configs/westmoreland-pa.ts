// lib/site-scan/adapters/configs/westmoreland-pa.ts
// Westmoreland County, PA — ArcGIS Online 2021 snapshot.
// Data vintage: January 2021. Field names are mainframe-style codes.
// ZONINGCODE / ZONEDESC are consistently null in this dataset.
// Direct county GIS server (gis.westmorelandcountypa.gov) returns 403.

import type { CountyAdapterConfig } from "../types";

export const WESTMORELAND_PA: CountyAdapterConfig = {
  county: "Westmoreland",
  state: "PA",
  serviceUrl:
    "https://services2.arcgis.com/eQgAMgHr2CRobt2r/ArcGIS/rest/services/2021_Westmoreland_County_Parcels/FeatureServer",
  layerId: 1,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "UPI",
    address: "SITUS",
    city: "MUNI",
    zip: "ZIP",
    zoning_class: "LCODE",          // land-use code, not zoning (zoning is null)
    land_area_sf: "ACRES",          // NOTE: value is in ACRES, not SF
    assessed_value_total: "ATOTL",
    assessed_value_land: "ALAND",
    assessed_value_building: "AIMP",
    market_value_total: "ATOTL",    // no separate market value
    owner_name: "NAME",
    land_use_code: "LCODE",
    land_use_description: "LCODE",  // no description field
    tax_district: "MUNI",
    millage_rate: "MUNI",           // no millage field
    last_sale_date: "SD1YR",        // year only
    last_sale_price: "SA1",
    year_built: "YRBLT",
    building_sf: "SFLA",
  },
  areaFieldIsAcres: true,
  zoningClassMap: {
    retail: ["C"],
    industrial: ["I"],
    residential: ["R"],
    office: ["C"],
    mixed_use: ["C"],
    vacant: ["V", "A"],
  },
};

// lib/site-scan/adapters/configs/new-york.ts
// New York statewide — 38 of 62 counties (including NYC).
// Full market value, assessed value, owner, use code, acreage.
// MaxRecords: 1,000. Requires outFields=*.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_NY: CountyAdapterConfig = {
  county: "*",
  state: "NY",
  serviceUrl:
    "https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Tax_Parcels_Public/FeatureServer",
  layerId: 1,
  spatialReference: 4326,
  useWildcardOutFields: true,
  fieldMap: {
    parcel_number: "SWIS_SBL_ID",
    address: "PARCEL_ADDR",
    city: "MUNI_NAME",
    zip: "LOC_ZIP",
    zoning_class: "PROP_CLASS",
    zoning_description: "BLDG_STYLE_DESC",
    land_area_sf: "CALC_ACRES",     // NOTE: value is in ACRES
    assessed_value_total: "TOTAL_AV",
    assessed_value_land: "LAND_AV",
    assessed_value_building: "TOTAL_AV",
    market_value_total: "FULL_MARKET_VAL",
    owner_name: "PRIMARY_OWNER",
    land_use_code: "PROP_CLASS",
    land_use_description: "BLDG_STYLE_DESC",
    tax_district: "COUNTY_NAME",
    millage_rate: "COUNTY_NAME",
    last_sale_date: "ROLL_YR",
    last_sale_price: "TOTAL_AV",
    year_built: "YR_BLT",
    building_sf: "SQFT_LIVING",
  },
  areaFieldIsAcres: true,
  zoningClassMap: {
    // NY property class codes (2-digit)
    retail: ["04", "14", "15", "16", "17", "18", "19"],
    industrial: ["06", "07"],
    residential: ["01", "02", "03", "05", "09", "10", "11", "12", "13"],
    office: ["04"],
    mixed_use: ["04", "05"],
    vacant: ["30", "31", "32", "33", "34", "35", "36", "37", "38", "39"],
  },
};

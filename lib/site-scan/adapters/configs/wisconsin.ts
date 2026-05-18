// lib/site-scan/adapters/configs/wisconsin.ts
// Wisconsin statewide — all counties, 2025 vintage.
// Assessed value, fair market value, property tax, acreage, owner.
// MaxRecords: 2,000.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_WI: CountyAdapterConfig = {
  county: "*",
  state: "WI",
  serviceUrl:
    "https://services3.arcgis.com/n6uYoouQZW75n5WI/arcgis/rest/services/Wisconsin_Statewide_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCELID",
    address: "SITEADRESS",
    city: "PLACENAME",
    zip: "ZIPCODE",
    zoning_class: "PROPCLASS",
    land_area_sf: "GISACRES",       // NOTE: value is in ACRES
    assessed_value_total: "CNTASSDVALUE",
    assessed_value_land: "LNDVALUE",
    assessed_value_building: "IMPVALUE",
    market_value_total: "ESTFMKVALUE",
    owner_name: "OWNERNME1",
    land_use_code: "PROPCLASS",
    land_use_description: "PROPCLASS",
    tax_district: "PLACENAME",
    millage_rate: "NETPRPTA",
    last_sale_date: "CNTASSDVALUE",
    last_sale_price: "CNTASSDVALUE",
    year_built: "PROPCLASS",
    building_sf: "GISACRES",
  },
  areaFieldIsAcres: true,
  zoningClassMap: {
    retail: ["4"],           // WI property class 4 = commercial
    industrial: ["3"],       // class 3 = manufacturing
    residential: ["1"],      // class 1 = residential
    office: ["4"],
    mixed_use: ["4"],
    vacant: ["5", "6", "7"], // 5=special, 6=forest, 7=other
  },
};

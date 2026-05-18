// lib/site-scan/adapters/configs/ogrip-oh.ts
// Ohio statewide parcel layer — OGRIP. Covers all 88 counties.
// Less detail than county-specific, but universal search.

import type { CountyAdapterConfig } from "../types";

export const OGRIP_OH: CountyAdapterConfig = {
  county: "*", // statewide
  state: "OH",
  serviceUrl:
    "https://gis.ohiodnr.gov/arcgis/rest/services/OIT_Services/OGRIP_Parcels",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCELID",
    address: "SITEADDR",
    city: "CITY",
    zip: "ZIP",
    zoning_class: "ZONING",
    land_area_sf: "SHAPE_Area",
    assessed_value_total: "APPRTOTL",
    owner_name: "OWNERNME1",
    land_use_code: "USECD",
    land_use_description: "USEDESC",
    assessed_value_land: "APPRLAND",
    assessed_value_building: "APPRBLDG",
    market_value_total: "MKTLAND",
    tax_district: "TAXDIST",
    millage_rate: "MILLAGE",
    last_sale_date: "SALEDT",
    last_sale_price: "SALEPRIC",
    year_built: "YRBLT",
    building_sf: "SFLA",
    zoning_description: "ZONEDESC",
  },
  zoningClassMap: {
    retail: ["C-1", "C-2", "C-3", "C-4", "CB", "CC", "CR", "GC"],
    industrial: ["M-1", "M-2", "M-3", "LI", "HI", "GI"],
    residential: ["R-1", "R-2", "R-3", "R-4", "MF"],
    office: ["O-1", "O-2", "OC", "OP"],
    mixed_use: ["MX", "MU", "PD", "PUD"],
    vacant: ["VAC", "AG"],
  },
};

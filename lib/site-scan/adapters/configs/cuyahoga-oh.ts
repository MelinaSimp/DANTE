// lib/site-scan/adapters/configs/cuyahoga-oh.ts
// Cuyahoga County, Ohio — richer detail than OGRIP statewide.

import type { CountyAdapterConfig } from "../types";

export const CUYAHOGA_OH: CountyAdapterConfig = {
  county: "Cuyahoga",
  state: "OH",
  serviceUrl:
    "https://gis.cuyahogacounty.gov/arcgis/rest/services/FiscalOfficer/Parcels",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCEL_ID",
    address: "SITE_ADDR",
    city: "CITY",
    zip: "ZIP",
    zoning_class: "ZONING",
    zoning_description: "ZONE_DESC",
    land_area_sf: "SHAPE_Area",
    assessed_value_total: "APPRAISED_VAL",
    assessed_value_land: "LAND_VAL",
    assessed_value_building: "BLDG_VAL",
    market_value_total: "MKT_VAL",
    owner_name: "OWNER",
    land_use_code: "USE_CODE",
    land_use_description: "USE_DESC",
    tax_district: "TAX_DIST",
    millage_rate: "MILLAGE",
    last_sale_date: "SALE_DATE",
    last_sale_price: "SALE_PRICE",
    year_built: "YEAR_BUILT",
    building_sf: "BLDG_SF",
  },
  zoningClassMap: {
    retail: ["C-1", "C-2", "C-3", "C-4"],
    industrial: ["M-1", "M-2", "M-3"],
    residential: ["R-1", "R-2", "R-3", "R-4", "R-MF"],
    office: ["O-1", "O-2"],
    mixed_use: ["MX", "PD"],
  },
};

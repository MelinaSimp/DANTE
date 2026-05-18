// lib/site-scan/adapters/configs/beaver-pa.ts
// Beaver County, PA — clean schema, all fields populated.
// Owner, address, assessed + market values, land use, sale history,
// school district, year built, acreage.

import type { CountyAdapterConfig } from "../types";

export const BEAVER_PA: CountyAdapterConfig = {
  county: "Beaver",
  state: "PA",
  serviceUrl:
    "https://gis.beavercountypa.gov/server/rest/services/InfoAtlas/Parcels_with_Owner/FeatureServer",
  layerId: 22,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "Map_and_Parcel",
    address: "Location_Number",      // combined in override
    city: "MCN",
    zip: "Mail_Zipcode",
    zoning_class: "Landuse",
    land_area_sf: "Total_Acres",     // NOTE: value is in ACRES, not SF
    assessed_value_total: "Total_Value",
    assessed_value_land: "Land_Value",
    assessed_value_building: "Building_Value",
    market_value_total: "Total_Mark_Value",
    owner_name: "Owner_Name1",
    land_use_code: "Landuse",
    land_use_description: "Landuse",
    tax_district: "MCN",
    millage_rate: "MCN",
    last_sale_date: "Sale_Date",
    last_sale_price: "Sale_Amount",
    year_built: "Year_Built",
    building_sf: "Total_Acres",
  },
  areaFieldIsAcres: true,
  zoningClassMap: {
    retail: ["COMMERCIAL"],
    industrial: ["INDUSTRIAL"],
    residential: ["RESIDENTIAL"],
    office: ["COMMERCIAL"],
    mixed_use: ["COMMERCIAL"],
    vacant: ["VACANT LAND", "AGRICULTURAL"],
  },
};

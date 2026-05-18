// lib/site-scan/adapters/configs/butler-pa.ts
// Butler County, PA — cleanest field names of any Western PA county.
// All key attributes populated: owner, address, assessed values,
// land use, sale history, school district.

import type { CountyAdapterConfig } from "../types";

export const BUTLER_PA: CountyAdapterConfig = {
  county: "Butler",
  state: "PA",
  serviceUrl:
    "https://geo.co.butler.pa.us/server/rest/services/PAT/ParcelAndBoundary/MapServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "Parcel_ID",
    address: "PhysicalAddress",
    city: "MunicipalityDescription",
    zip: "Zip",
    zoning_class: "LandUseCode",
    land_area_sf: "Shape_Area",
    assessed_value_total: "AssessedValue",
    assessed_value_land: "AssessedLandValue",
    assessed_value_building: "AssessedBuildingValue",
    market_value_total: "AssessedValue",
    owner_name: "Owner",
    land_use_code: "LandUseCode",
    land_use_description: "LandUseCode",
    tax_district: "MunicipalityDescription",
    millage_rate: "MunicipalityDescription",
    last_sale_date: "LastSaleDate",
    last_sale_price: "LastSalePrice",
    year_built: "YearBuilt",
    building_sf: "Shape_Area",
  },
  zoningClassMap: {
    retail: ["COMM"],
    industrial: ["INDUS", "INDU"],
    residential: ["RES", "RESI"],
    office: ["COMM"],
    mixed_use: ["COMM"],
    vacant: ["VAC", "AG", "AGRI", "D-WL"],
  },
};

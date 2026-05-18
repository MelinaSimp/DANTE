// lib/site-scan/adapters/configs/butler-pa.ts
// Butler County, PA — all key attributes populated: owner, address,
// assessed values, land use, sale history, school district.
// Service rejects named outFields lists — must use outFields=*.
// Native SR is State Plane (102729) but accepts inSR=4326.

import type { CountyAdapterConfig } from "../types";

export const BUTLER_PA: CountyAdapterConfig = {
  county: "Butler",
  state: "PA",
  serviceUrl:
    "https://geo.co.butler.pa.us/server/rest/services/PAT/ParcelAndBoundary/MapServer",
  layerId: 0,
  spatialReference: 4326,
  useWildcardOutFields: true,
  fieldMap: {
    parcel_number: "PIN",
    address: "PhysicalAddress",
    city: "Municipality",
    zip: "CityStateZip",           // zip embedded in "CITY PA 16033"
    zoning_class: "LandUseCode",
    land_area_sf: "Shape.STArea()", // in native SR feet, not acres
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
    year_built: "LandUseCode",     // no year_built field
    building_sf: "Shape.STArea()",
  },
  zoningClassMap: {
    retail: ["COMM"],
    industrial: ["INDUS", "INDU"],
    residential: ["RES", "RESI", "LRES"],
    office: ["COMM"],
    mixed_use: ["COMM"],
    vacant: ["VAC", "AG", "AGRI", "D-WL"],
  },
};

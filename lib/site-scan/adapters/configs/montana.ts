// lib/site-scan/adapters/configs/montana.ts
// Montana statewide — all counties.
// Owner, value, property type, acreage (including irrigated/forest/grazing).
// MaxRecords: 2,000.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_MT: CountyAdapterConfig = {
  county: "*",
  state: "MT",
  serviceUrl:
    "https://gisservicemt.gov/arcgis/rest/services/MSDI_Framework/Parcels/MapServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "ParcelID",
    address: "OwnerAddress1",
    city: "OwnerCity",
    zip: "OwnerZip",
    zoning_class: "PropType",
    land_area_sf: "GISAcres",       // NOTE: value is in ACRES
    assessed_value_total: "TotalValue",
    assessed_value_land: "TotalLandValue",
    assessed_value_building: "TotalBuildingValue",
    market_value_total: "TotalValue",
    owner_name: "OwnerName",
    land_use_code: "PropType",
    land_use_description: "PropType",
    tax_district: "CountyName",
    millage_rate: "CountyName",
    last_sale_date: "PropType",
    last_sale_price: "TotalValue",
    year_built: "PropType",
    building_sf: "GISAcres",
  },
  areaFieldIsAcres: true,
  zoningClassMap: {
    retail: ["COMMERCIAL"],
    industrial: ["INDUSTRIAL"],
    residential: ["RESIDENTIAL"],
    office: ["COMMERCIAL"],
    mixed_use: ["COMMERCIAL"],
    vacant: ["VACANT", "AGRICULTURAL", "GRAZING", "FOREST"],
  },
};

// lib/site-scan/adapters/configs/kentucky.ts
// Kentucky statewide parcel data via KY Geography Network / KYGIS.
// All 120 counties with PVA (Property Valuation Administrator) data.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_KY: CountyAdapterConfig = {
  county: "*",
  state: "KY",
  serviceUrl:
    "https://kygisserver.ky.gov/arcgis/rest/services/WGS84WMS_Services/Ky_Property_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PVA_ID",
    address: "PROPERTY_ADDR",
    city: "PROPERTY_CITY",
    zip: "PROPERTY_ZIP",
    zoning_class: "LAND_USE",
    zoning_description: "LAND_USE_DESC",
    land_area_sf: "ACREAGE",
    assessed_value_total: "TOTAL_VALUE",
    assessed_value_land: "LAND_VALUE",
    assessed_value_building: "IMPROVEMENT_VALUE",
    market_value_total: "FAIR_CASH_VALUE",
    owner_name: "OWNER",
    land_use_code: "LAND_USE",
    land_use_description: "LAND_USE_DESC",
    tax_district: "COUNTY",
  },
  areaFieldIsAcres: true,
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "C-1", "C-2", "C-3", "B-1", "B-2", "B-3"],
    industrial: ["I", "I-1", "I-2", "M-1", "M-2"],
    residential: ["R-1", "R-2", "R-3", "R-4", "R-5", "R-6"],
    office: ["O", "P", "OP"],
    mixed_use: ["MXD", "PD", "NSC"],
    vacant: ["A", "AG", "F", "CON", "OS"],
  },
};

// lib/site-scan/adapters/configs/wyoming.ts
// Wyoming statewide parcel data via Wyoming Enterprise Technology Services.
// All 23 counties. Rich attribute set with owner, value, and address.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_WY: CountyAdapterConfig = {
  county: "*",
  state: "WY",
  serviceUrl:
    "https://services3.arcgis.com/r0iJ85SKZ4zAzz3P/arcgis/rest/services/Wyoming_Parcels_for_2025/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "parcelnb",
    address: "locationad",
    city: "jurisdicti",
    zip: "mailzipcod",
    zoning_class: "",
    zoning_description: "",
    land_area_sf: "LANDGROSSA",
    assessed_value_total: "assessedva",
    assessed_value_land: "actualvalu",
    assessed_value_building: "",
    market_value_total: "actualvalu",
    owner_name: "ownername1",
    land_use_code: "",
    land_use_description: "legal",
    tax_district: "jurisdicti",
  },
  areaFieldIsAcres: true,
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "COM"],
    industrial: ["I", "IND"],
    residential: ["R", "RES"],
    office: ["O", "OFF"],
    mixed_use: ["MU", "PUD"],
    vacant: ["AG", "RAN", "VAC"],
  },
};

// lib/site-scan/adapters/configs/idaho.ts
// Idaho statewide parcel data via Idaho Dept. of Lands WhiteStar dataset.
// All 44 counties. Rich attribute set with owner, value, and address.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_ID: CountyAdapterConfig = {
  county: "*",
  state: "ID",
  serviceUrl:
    "https://gis1.idl.idaho.gov/arcgis/rest/services/Portal/WhiteStar_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "apn",
    address: "propfuladd",
    city: "propcity",
    zip: "propzip",
    zoning_class: "zoning",
    zoning_description: "landusedes",
    land_area_sf: "acreage",
    assessed_value_total: "totalvalue",
    assessed_value_land: "landval",
    assessed_value_building: "improvval",
    market_value_total: "totalvalue",
    owner_name: "owner1",
    land_use_code: "landusecod",
    land_use_description: "landusedes",
    tax_district: "county",
  },
  areaFieldIsAcres: true,
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C-1", "C-2", "C-3", "C-G"],
    industrial: ["I-1", "I-2", "M-1", "M-2", "LI"],
    residential: ["R-1", "R-2", "R-3", "R-4", "RS"],
    office: ["O-1", "O-P", "BP"],
    mixed_use: ["MU", "PUD", "PD"],
    vacant: ["AG", "A-1", "A-2", "RR"],
  },
};

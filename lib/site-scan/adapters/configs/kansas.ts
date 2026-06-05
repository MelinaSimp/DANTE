// lib/site-scan/adapters/configs/kansas.ts
// Kansas statewide parcel data via DASC (Data Access and Support Center).
// All 105 counties.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_KS: CountyAdapterConfig = {
  county: "*",
  state: "KS",
  serviceUrl:
    "https://services.kansasgis.org/arcgis8/rest/services/Boundaries/Kansas_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCEL_ID",
    address: "PHYS_ADDR",
    city: "PHYS_CITY",
    zip: "PHYS_ZIP",
    zoning_class: "USE_CODE",
    zoning_description: "USE_DESC",
    land_area_sf: "Shape_Area",
    assessed_value_total: "ASSESSED",
    assessed_value_land: "LAND_VAL",
    assessed_value_building: "BLDG_VAL",
    market_value_total: "APPRAISED",
    owner_name: "OWNER",
    land_use_code: "USE_CODE",
    land_use_description: "USE_DESC",
    tax_district: "COUNTY",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C-1", "C-2", "C-3", "C-4", "CP"],
    industrial: ["I-1", "I-2", "I-3", "BP"],
    residential: ["R-1", "R-2", "R-3", "R-4", "R-5"],
    office: ["O-1", "O-2", "OP"],
    mixed_use: ["PD", "MXD"],
    vacant: ["AG", "RA", "OS"],
  },
};

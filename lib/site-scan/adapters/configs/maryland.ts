// lib/site-scan/adapters/configs/maryland.ts
// Maryland statewide parcel data via MD iMap / SDAT property layer.
// All 24 jurisdictions (23 counties + Baltimore City).

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_MD: CountyAdapterConfig = {
  county: "*",
  state: "MD",
  serviceUrl:
    "https://geodata.md.gov/imap/rest/services/PlanningCadastre/MD_PropertyData/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "ACCTID",
    address: "ADDR_PREMISES",
    city: "ADDR_CITY",
    zip: "ADDR_ZIP",
    zoning_class: "DESCLU",
    zoning_description: "DESCLU",
    land_area_sf: "SQFT",
    assessed_value_total: "NFMTTLVL",
    assessed_value_land: "NFMLANDVL",
    assessed_value_building: "NFMIMPVL",
    market_value_total: "NFMTTLVL",
    owner_name: "OWNNAME1",
    land_use_code: "LUCODE",
    land_use_description: "DESCLU",
    tax_district: "JURESSION",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "C-1", "C-2", "C-3", "C-4", "CC", "CR"],
    industrial: ["I", "I-1", "I-2", "I-3", "IM"],
    residential: ["R-1", "R-2", "R-3", "R-4", "R-5", "RC"],
    office: ["O-R", "O-S", "O-T", "OC"],
    mixed_use: ["MX", "MXD", "PD", "TOD"],
    vacant: ["AG", "RUR", "OS", "CON"],
  },
};

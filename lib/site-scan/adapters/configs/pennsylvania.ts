// lib/site-scan/adapters/configs/pennsylvania.ts
// Pennsylvania statewide parcel data via PA Spatial Data Access (PASDA).
// All 67 counties with assessor parcel boundaries.
// Supplements the existing county-level adapters (Allegheny, Westmoreland, Butler, Beaver).

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_PA: CountyAdapterConfig = {
  county: "*",
  state: "PA",
  serviceUrl:
    "https://mapservices.pasda.psu.edu/server/rest/services/pasda/PA_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PIN",
    address: "ADDR",
    city: "CITY",
    zip: "ZIP",
    zoning_class: "USE_CODE",
    zoning_description: "USE_DESC",
    land_area_sf: "Shape_Area",
    assessed_value_total: "TOT_ASMT",
    assessed_value_land: "LND_ASMT",
    assessed_value_building: "IMP_ASMT",
    market_value_total: "TOT_ASMT",
    owner_name: "OWNER",
    land_use_code: "USE_CODE",
    land_use_description: "USE_DESC",
    tax_district: "COUNTY",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "C-1", "C-2", "C-3", "CC", "GC"],
    industrial: ["I", "I-1", "I-2", "LI", "HI"],
    residential: ["R-1", "R-2", "R-3", "R-4", "RS", "RM"],
    office: ["O", "O-1", "O-2", "OP"],
    mixed_use: ["MU", "MXD", "PD", "TC"],
    vacant: ["AG", "OS", "VAC", "RUR"],
  },
};

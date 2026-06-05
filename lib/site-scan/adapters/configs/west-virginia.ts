// lib/site-scan/adapters/configs/west-virginia.ts
// West Virginia statewide parcel data via WV DOT GIS.
// All 55 counties. Includes owner, address, legal description.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_WV: CountyAdapterConfig = {
  county: "*",
  state: "WV",
  serviceUrl:
    "https://gis.transportation.wv.gov/arcgis/rest/services/Economic/FeatureServer",
  layerId: 5,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "CleanParcelID",
    address: "FullPhysicalAddress",
    city: "",
    zip: "",
    zoning_class: "",
    zoning_description: "FullLegalDescription",
    land_area_sf: "Acres_C",
    assessed_value_total: "",
    assessed_value_land: "",
    assessed_value_building: "",
    market_value_total: "",
    owner_name: "FullOwnerName",
    land_use_code: "",
    land_use_description: "FullLegalDescription",
    tax_district: "Dist",
  },
  areaFieldIsAcres: true,
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C-1", "C-2"],
    industrial: ["I-1", "I-2", "M"],
    residential: ["R-1", "R-2", "R-3"],
    office: ["O-1", "B"],
    mixed_use: ["MU", "PUD"],
    vacant: ["AG", "F", "RR"],
  },
};

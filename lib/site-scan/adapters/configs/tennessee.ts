// lib/site-scan/adapters/configs/tennessee.ts
// Tennessee statewide parcel data via TN Comptroller of the Treasury
// CAMA/GIS program. All 95 counties.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_TN: CountyAdapterConfig = {
  county: "*",
  state: "TN",
  serviceUrl:
    "https://tnmap.tn.gov/arcgis/rest/services/PARCELS/TN_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARCELID",
    address: "LOCATION",
    city: "CITY",
    zip: "ZIP",
    zoning_class: "LANDUSE",
    zoning_description: "LANDUSE",
    land_area_sf: "ACREAGE",
    assessed_value_total: "TOTALAPPR",
    assessed_value_land: "LANDAPPR",
    assessed_value_building: "IMPRAPPR",
    market_value_total: "TOTALAPPR",
    owner_name: "OWNER",
    land_use_code: "LANDUSE",
    land_use_description: "LANDUSE",
    tax_district: "COUNTY",
  },
  areaFieldIsAcres: true,
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["COM", "COMMERCIAL", "C1", "C2"],
    industrial: ["IND", "INDUSTRIAL", "I1", "I2"],
    residential: ["RES", "RESIDENTIAL", "R1", "R2"],
    office: ["OFF", "OFFICE"],
    mixed_use: ["MU", "PD", "PUD"],
    vacant: ["VAC", "VACANT", "AG", "AGRICULTURAL", "FARM"],
  },
};

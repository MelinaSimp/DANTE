// lib/site-scan/adapters/configs/california.ts
// California statewide parcel data via CA State Geoportal / BOE parcels.
// All 58 counties with assessor-standardized schema.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_CA: CountyAdapterConfig = {
  county: "*",
  state: "CA",
  serviceUrl:
    "https://gis.data.ca.gov/arcgis/rest/services/Economy/Statewide_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "APN",
    address: "SitusAddress",
    city: "SitusCity",
    zip: "SitusZip",
    zoning_class: "UseCode",
    zoning_description: "UseDescription",
    land_area_sf: "Shape_Area",
    assessed_value_total: "TotalAssessedValue",
    assessed_value_land: "LandValue",
    assessed_value_building: "ImprovementValue",
    market_value_total: "TotalAssessedValue",
    owner_name: "OwnerName",
    land_use_code: "UseCode",
    land_use_description: "UseDescription",
    tax_district: "CountyName",
  },
  useWildcardOutFields: true,
  zoningClassMap: {
    retail: ["C", "C-1", "C-2", "CC", "CR", "CG", "CH", "CN"],
    industrial: ["M", "M-1", "M-2", "M-3", "IL", "IH", "IP"],
    residential: ["R-1", "R-2", "R-3", "R-4", "R-5", "RS", "RM", "RH"],
    office: ["CO", "CP", "O", "OP"],
    mixed_use: ["MU", "MXD", "PD", "SP"],
    vacant: ["AG", "A", "OS", "VAC", "U"],
  },
};

// lib/site-scan/adapters/configs/north-dakota.ts
// North Dakota statewide parcel data via ND GIS Hub.
// All 53 counties. Boundary/identification attributes only.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_ND: CountyAdapterConfig = {
  county: "*",
  state: "ND",
  serviceUrl:
    "https://services1.arcgis.com/GOcSXpzwBHyk2nog/arcgis/rest/services/NDGISHUB_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "GISID",
    address: "",
    city: "TownshipName",
    zip: "",
    zoning_class: "",
    zoning_description: "",
    land_area_sf: "CalculatedAcres",
    assessed_value_total: "",
    assessed_value_land: "",
    assessed_value_building: "",
    market_value_total: "",
    owner_name: "Ownership",
    land_use_code: "FeatureType",
    land_use_description: "FeatureType",
    tax_district: "CountyName",
  },
  areaFieldIsAcres: true,
  useWildcardOutFields: true,
  zoningClassMap: {},
};

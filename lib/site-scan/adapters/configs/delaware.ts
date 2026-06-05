// lib/site-scan/adapters/configs/delaware.ts
// Delaware statewide parcel data via FirstMap Delaware.
// All 3 counties. Sparse attribute set (PIN, acres, county).

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_DE: CountyAdapterConfig = {
  county: "*",
  state: "DE",
  serviceUrl:
    "https://enterprise.firstmap.delaware.gov/arcgis/rest/services/PlanningCadastre/DE_StateParcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PIN",
    address: "",
    city: "",
    zip: "",
    zoning_class: "",
    zoning_description: "",
    land_area_sf: "ACRES",
    assessed_value_total: "",
    assessed_value_land: "",
    assessed_value_building: "",
    market_value_total: "",
    owner_name: "",
    land_use_code: "",
    land_use_description: "",
    tax_district: "COUNTY",
  },
  areaFieldIsAcres: true,
  useWildcardOutFields: true,
  zoningClassMap: {},
};

// lib/site-scan/adapters/configs/arkansas.ts
// Arkansas statewide — all 75 counties.
// Owner, assessed + total value, address, tax info populated.
// MaxRecords: 200 (low). Requires outFields=*.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_AR: CountyAdapterConfig = {
  county: "*",
  state: "AR",
  serviceUrl:
    "https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Planning_Cadastre/FeatureServer",
  layerId: 6,
  spatialReference: 4326,
  useWildcardOutFields: true,
  fieldMap: {
    parcel_number: "parcelid",
    address: "adrlabel",
    city: "adrcity",
    zip: "adrzip5",
    zoning_class: "parceltype",
    land_area_sf: "Shape__Area",    // in native SR units (feet squared)
    assessed_value_total: "assessvalue",
    assessed_value_land: "landvalue",
    assessed_value_building: "impvalue",
    market_value_total: "totalvalue",
    owner_name: "ownername",
    land_use_code: "parceltype",
    land_use_description: "parceltype",
    tax_district: "county",
    millage_rate: "taxcode",
    last_sale_date: "sourcedate",
    last_sale_price: "totalvalue",
    year_built: "parceltype",
    building_sf: "Shape__Area",
  },
  zoningClassMap: {
    retail: ["CV", "CM"],
    industrial: ["IN"],
    residential: ["RS", "RL", "RM", "RH"],
    office: ["CV", "CM"],
    mixed_use: ["CV"],
    vacant: ["VA", "AG", "FO"],
  },
};

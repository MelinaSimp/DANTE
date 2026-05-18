// lib/site-scan/adapters/configs/colorado.ts
// Colorado statewide — all 64 counties. Gold standard schema:
// zoning, land use, assessed + appraised values, sale history, owner, acreage.
// MaxRecords: 2,000.

import type { CountyAdapterConfig } from "../types";

export const STATEWIDE_CO: CountyAdapterConfig = {
  county: "*",
  state: "CO",
  serviceUrl:
    "https://gis.colorado.gov/public/rest/services/Address_and_Parcel/Colorado_Public_Parcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "parcelId",
    address: "situsAdd",
    city: "sitAddCty",
    zip: "sitAddZip",
    zoning_class: "zoningCode",
    zoning_description: "zoningDesc",
    land_area_sf: "landAcres",      // NOTE: value is in ACRES
    assessed_value_total: "asedValTot",
    assessed_value_land: "asedValLnd",
    assessed_value_building: "asedValImp",
    market_value_total: "apprValTot",
    owner_name: "owner",
    land_use_code: "landUseCde",
    land_use_description: "landUseDsc",
    tax_district: "countyName",
    millage_rate: "countyName",
    last_sale_date: "saleDate",
    last_sale_price: "salePrice",
    year_built: "landUseCde",
    building_sf: "landAcres",
  },
  areaFieldIsAcres: true,
  zoningClassMap: {
    retail: ["C", "C-1", "C-2", "C-3", "CC", "CR", "GC", "B-1", "B-2"],
    industrial: ["I", "I-1", "I-2", "M-1", "M-2", "LI", "HI"],
    residential: ["R", "R-1", "R-2", "R-3", "R-4", "RE", "RS", "RM"],
    office: ["O", "O-1", "O-2", "OC"],
    mixed_use: ["MU", "MX", "PD", "PUD"],
    vacant: ["A", "AG", "VAC", "OS"],
  },
};

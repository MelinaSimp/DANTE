// lib/site-scan/adapters/configs/cuyahoga-oh.ts
// Cuyahoga County, Ohio (Cleveland + all suburbs) — Fiscal Office parcel
// fabric. Covers the whole county including the City of Cleveland.
// Re-sourced 2026-06: the old gis.cuyahogacounty.gov/.../FiscalOfficer/Parcels
// URL 404s; the live service is the CCFO Parcel Fabric (verified with a live
// spatial+geometry query, ~0.3s).

import type { CountyAdapterConfig } from "../types";

export const CUYAHOGA_OH: CountyAdapterConfig = {
  county: "Cuyahoga",
  state: "OH",
  serviceUrl:
    "https://gis.cuyahogacounty.gov/server/rest/services/CCFO/Parcel_Fabric_Taxparcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "parcel_id",
    address: "par_addr_all",
    city: "parcel_city",
    zip: "parcel_zip",
    zoning_class: "zoning_code",
    zoning_description: "zoning_use",
    land_area_sf: "parcel_acreage",
    assessed_value_total: "certified_tax_total",
    assessed_value_land: "certified_tax_land",
    assessed_value_building: "certified_tax_building",
    owner_name: "parcel_owner",
    land_use_code: "tax_luc",
    land_use_description: "tax_luc_description",
    tax_district: "tax_district",
    last_sale_date: "last_transfer_date",
    last_sale_price: "last_sales_amount",
  },
  areaFieldIsAcres: true, // parcel_acreage is in acres
  zoningClassMap: {
    retail: ["C-1", "C-2", "C-3", "C-4", "CC", "GR", "RA", "GB", "LB"],
    industrial: ["GI", "SI", "M-1", "M-2", "M-3", "IL", "IH"],
    residential: ["R1", "R2", "R3", "RA1", "RA2", "RES", "MF"],
    office: ["O-1", "O-2", "SO", "GO"],
    mixed_use: ["MU", "PUD", "SD", "PD"],
    vacant: ["VAC"],
  },
};

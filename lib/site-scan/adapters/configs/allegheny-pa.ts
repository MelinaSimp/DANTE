// lib/site-scan/adapters/configs/allegheny-pa.ts
// Allegheny County, PA (Pittsburgh). 60+ attribute fields.
// NOTE: useStandardizedQueries is true on this service — string WHERE
// clauses (e.g. CLASSDESC='RESIDENTIAL') fail silently. Numeric
// comparisons work. The adapter uses numeric field filters where
// possible and falls back to 1=1 + client-side filtering.

import type { CountyAdapterConfig } from "../types";

export const ALLEGHENY_PA: CountyAdapterConfig = {
  county: "Allegheny",
  state: "PA",
  serviceUrl:
    "https://services1.arcgis.com/vdNDkVykv9vEWFX4/arcgis/rest/services/AlCoParcels/FeatureServer",
  layerId: 0,
  spatialReference: 4326,
  fieldMap: {
    parcel_number: "PARID",
    address: "PROPERTYHOUSENUM", // combined in mapFeature override
    city: "PROPERTYCITY",
    zip: "PROPERTYZIP5",
    zoning_class: "CLASSDESC",
    land_area_sf: "LOTAREA",
    assessed_value_total: "COUNTYTOTAL",
    assessed_value_land: "COUNTYLAND",
    assessed_value_building: "COUNTYBUILDING",
    market_value_total: "FAIRMARKETTOTAL",
    owner_name: "PROPERTYOWNER",
    land_use_code: "CLASSDESC",
    land_use_description: "USEDESC",
    tax_district: "MUNIDESC",
    millage_rate: "TAXCODE",
    last_sale_date: "SALEDATE",
    last_sale_price: "SALEPRICE",
    year_built: "YEARBUILT",
    building_sf: "FINISHEDLIVINGAREA",
  },
  zoningClassMap: {
    retail: ["COMMERCIAL"],
    industrial: ["INDUSTRIAL"],
    residential: ["RESIDENTIAL"],
    office: ["COMMERCIAL"],
    mixed_use: ["COMMERCIAL"],
    vacant: ["VACANT LAND"],
  },
};
